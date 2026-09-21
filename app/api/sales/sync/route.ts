import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { generateId, getBangkokDateTimeString } from '@/lib/utils'
import { ensureSalesSourceColumn } from '@/lib/db-tables'
import {
  parseSalesCsv, matchBranch, toCsvUrl,
  normalizeDate, normalizeAmount,
  type ParsedSalesRow,
} from '@/lib/sales-import'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// ซิงก์ยอดขายรายสาขาจาก Google Sheet
//
// เรียกได้ 2 ทาง
//   1. ผู้ดูแลกดจากหน้าเว็บ (ใช้ session ปกติ)
//   2. Apps Script ในชีทหรือตัวจับเวลาภายนอก ส่ง X-Sync-Key ที่ตั้งไว้
//
// การซิงก์เป็น idempotent: รายการที่มาจากชีทของ "สาขา+วันที่" เดิมจะถูกแทนที่
// ส่วนรายการที่คีย์เองในระบบจะไม่ถูกแตะ

const URL_KEY = 'sales_sync_csv_url'
const SYNC_KEY = 'sales_sync_key'
const LAST_KEY = 'sales_sync_last'
// จับคู่ชื่อสาขาในชีทกับสาขาในระบบ { "ชื่อในชีท": "sales_point_id" }
// ค่าว่างหมายถึงไม่นำเข้าชื่อนั้น
const ALIAS_KEY = 'sales_sync_aliases'

async function ensureSettings(db: any) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()
}

async function getSetting(db: any, key: string): Promise<string> {
  try {
    const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first() as any
    return row?.value ?? ''
  } catch {
    return ''
  }
}

async function setSetting(db: any, key: string, value: string) {
  await db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).bind(key, value).run()
}

/** ผู้เรียกต้องเป็นผู้ดูแล หรือถือคีย์ซิงก์ที่ตั้งไว้ */
async function authorize(request: NextRequest, db: any): Promise<{ ok: boolean; via: string }> {
  const provided = request.headers.get('X-Sync-Key') || ''
  if (provided) {
    const expected = await getSetting(db, SYNC_KEY)
    // เทียบความยาวก่อน เพื่อไม่ให้คีย์ว่างผ่านได้
    if (expected && provided === expected) return { ok: true, via: 'key' }
    return { ok: false, via: 'key' }
  }
  const user = await isAdminAuthorized(request, db, 'manager')
  return { ok: !!user, via: 'session' }
}

interface ImportOutcome {
  imported: number
  replaced: number
  branches: string[]
  unmatched: Array<{ branch: string; rows: number }>
  skipped: Array<{ line: number; reason: string; raw: string }>
}

async function importRows(db: any, rows: ParsedSalesRow[], skipped: any[]): Promise<ImportOutcome> {
  await ensureSalesSourceColumn(db)

  const branchRes = await db.prepare('SELECT id, name FROM sales_points').all()
  const branches = (branchRes.results || []) as Array<{ id: string; name: string }>

  // ชื่อที่ผู้ใช้จับคู่ไว้เองมาก่อนการเดาชื่อ
  let aliases: Record<string, string> = {}
  try {
    aliases = JSON.parse((await getSetting(db, ALIAS_KEY)) || '{}')
  } catch {
    aliases = {}
  }
  const validIds = new Set(branches.map(b => b.id))

  const unmatchedCount = new Map<string, number>()
  const matched: Array<{ sales_point_id: string; row: ParsedSalesRow }> = []

  for (const row of rows) {
    const alias = aliases[row.branch]
    if (alias !== undefined) {
      // จับคู่ไว้กับค่าว่าง = ตั้งใจไม่นำเข้าชื่อนี้
      if (alias && validIds.has(alias)) matched.push({ sales_point_id: alias, row })
      continue
    }
    const branch = matchBranch(branches, row.branch)
    if (!branch) {
      unmatchedCount.set(row.branch, (unmatchedCount.get(row.branch) || 0) + 1)
      continue
    }
    matched.push({ sales_point_id: branch.id, row })
  }

  // แทนที่เฉพาะรายการที่เคยซิงก์มาจากชีทของคู่ สาขา+วันที่ เดียวกัน
  let replaced = 0
  const pairs = new Set(matched.map(m => `${m.sales_point_id}|${m.row.date}`))
  for (const pair of Array.from(pairs)) {
    const [spId, date] = pair.split('|')
    const res = await db.prepare(
      "DELETE FROM sales WHERE sales_point_id = ? AND date = ? AND COALESCE(source, 'manual') = 'sheet'"
    ).bind(spId, date).run()
    replaced += res?.meta?.changes || 0
  }

  const now = getBangkokDateTimeString()
  const CHUNK = 40
  for (let i = 0; i < matched.length; i += CHUNK) {
    const stmts = matched.slice(i, i + CHUNK).map(m => db.prepare(
      `INSERT INTO sales (id, employee_id, sales_point_id, date, amount, notes, source, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'sheet', ?)`
    ).bind(generateId(), m.sales_point_id, m.row.date, m.row.amount, m.row.notes, now))
    await db.batch(stmts)
  }

  return {
    imported: matched.length,
    replaced,
    branches: Array.from(new Set(matched.map(m => m.sales_point_id))),
    unmatched: Array.from(unmatchedCount.entries()).map(([branch, rows]) => ({ branch, rows })),
    skipped,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureSettings(db)

    const auth = await authorize(request, db)
    if (!auth.ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const [url, key, last, aliasRaw] = await Promise.all([
      getSetting(db, URL_KEY),
      getSetting(db, SYNC_KEY),
      getSetting(db, LAST_KEY),
      getSetting(db, ALIAS_KEY),
    ])

    const branchRes = await db.prepare('SELECT id, name FROM sales_points ORDER BY name').all()

    return Response.json({
      csv_url: url,
      sync_key: key,
      last_sync: last ? JSON.parse(last) : null,
      aliases: aliasRaw ? JSON.parse(aliasRaw) : {},
      branches: branchRes.results || [],
    })
  } catch (error) {
    console.error('GET /api/sales/sync error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * รับได้ 3 แบบ
 *   { rows: [{date, branch, amount}] }  — Apps Script ส่งมาตรง ๆ
 *   { csv: "..." }                       — วาง CSV มาเอง
 *   { }                                  — ไปดึงจากลิงก์ที่ตั้งไว้
 * และ { settings: { csv_url, sync_key } } สำหรับบันทึกการตั้งค่า
 */
export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureSettings(db)

    const auth = await authorize(request, db)
    if (!auth.ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as {
      rows?: Array<{ date?: string; branch?: string; amount?: string | number; notes?: string }>
      csv?: string
      settings?: { csv_url?: string; sync_key?: string; aliases?: Record<string, string> }
    }

    // บันทึกการตั้งค่าอย่างเดียว (เฉพาะผู้ดูแล ไม่ให้คีย์ซิงก์แก้การตั้งค่าได้)
    if (body.settings) {
      if (auth.via !== 'session') return Response.json({ error: 'Forbidden' }, { status: 403 })
      if (body.settings.csv_url !== undefined) {
        await setSetting(db, URL_KEY, toCsvUrl(body.settings.csv_url))
      }
      if (body.settings.sync_key !== undefined) {
        await setSetting(db, SYNC_KEY, body.settings.sync_key.trim())
      }
      if (body.settings.aliases !== undefined) {
        await setSetting(db, ALIAS_KEY, JSON.stringify(body.settings.aliases))
      }
      return Response.json({ success: true, csv_url: await getSetting(db, URL_KEY) })
    }

    let rows: ParsedSalesRow[] = []
    let skipped: any[] = []

    if (Array.isArray(body.rows)) {
      // ข้อมูลที่ส่งมาเป็น JSON — ตรวจทีละแถวเหมือนกับที่ทำกับ CSV
      body.rows.forEach((r, i) => {
        const date = normalizeDate(String(r.date ?? ''))
        const branch = String(r.branch ?? '').trim()
        const amount = normalizeAmount(r.amount ?? '')
        if (!date) { skipped.push({ line: i + 1, reason: 'วันที่ไม่ถูกต้อง', raw: JSON.stringify(r).slice(0, 120) }); return }
        if (!branch) { skipped.push({ line: i + 1, reason: 'ไม่ระบุสาขา', raw: JSON.stringify(r).slice(0, 120) }); return }
        if (amount === null) { skipped.push({ line: i + 1, reason: 'ยอดขายไม่ใช่ตัวเลข', raw: JSON.stringify(r).slice(0, 120) }); return }
        rows.push({ date, branch, amount, notes: r.notes ?? null })
      })
    } else {
      let csv = body.csv || ''
      if (!csv) {
        const url = await getSetting(db, URL_KEY)
        if (!url) return Response.json({ error: 'ยังไม่ได้ตั้งลิงก์ Google Sheet (CSV)' }, { status: 400 })
        const res = await fetch(url, { redirect: 'follow' })
        if (!res.ok) {
          return Response.json({
            error: `ดึงข้อมูลจากลิงก์ไม่สำเร็จ (HTTP ${res.status}) — ตรวจว่าเผยแพร่ชีทเป็น CSV แล้วหรือยัง`,
          }, { status: 502 })
        }
        csv = await res.text()
      }
      const parsed = parseSalesCsv(csv)
      rows = parsed.rows
      skipped = parsed.skipped
    }

    const outcome = await importRows(db, rows, skipped)

    const summary = {
      at: getBangkokDateTimeString(),
      via: auth.via === 'key' ? 'auto' : 'manual',
      imported: outcome.imported,
      replaced: outcome.replaced,
      unmatched: outcome.unmatched,
      skipped: outcome.skipped.length,
    }
    await setSetting(db, LAST_KEY, JSON.stringify(summary))

    return Response.json({ success: true, ...outcome, last_sync: summary })
  } catch (error) {
    console.error('POST /api/sales/sync error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
