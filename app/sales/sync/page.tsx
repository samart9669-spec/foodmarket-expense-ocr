'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'

interface LastSync {
  at: string
  via: string
  imported: number
  replaced: number
  skipped: number
  unmatched: Array<{ branch: string; rows: number }>
}

interface SyncResult {
  imported: number
  replaced: number
  unmatched: Array<{ branch: string; rows: number }>
  skipped: Array<{ line: number; reason: string; raw: string }>
}

function randomKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function SalesSyncPage() {
  const [csvUrl, setCsvUrl] = useState('')
  const [syncKey, setSyncKey] = useState('')
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [last, setLast] = useState<LastSync | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [origin, setOrigin] = useState('')
  const [sheetTab, setSheetTab] = useState('')
  const [aliases, setAliases] = useState<Record<string, string>>({})

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/sales/sync', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => {
        if (d?.error) { setToast({ msg: d.error, ok: false }); return }
        setCsvUrl(d.csv_url || '')
        setSyncKey(d.sync_key || '')
        setBranches(d.branches || [])
        setAliases(d.aliases || {})
        setLast(d.last_sync || null)
      })
      .catch(() => setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const saveSettings = async (patch: { csv_url?: string; sync_key?: string; aliases?: Record<string, string> }) => {
    setBusy(true)
    try {
      const res = await fetch('/api/sales/sync', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: patch }),
      })
      const d = await res.json() as any
      if (res.ok) { setToast({ msg: 'บันทึกการตั้งค่าแล้ว', ok: true }); load() }
      else setToast({ msg: d.error || 'บันทึกไม่สำเร็จ', ok: false })
    } finally {
      setBusy(false)
    }
  }

  const syncNow = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/sales/sync', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json() as any
      if (!res.ok) { setToast({ msg: d.error || 'ซิงก์ไม่สำเร็จ', ok: false }); return }
      setResult(d)
      setLast(d.last_sync)
      setToast({ msg: `ซิงก์สำเร็จ นำเข้า ${d.imported} รายการ`, ok: true })
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setBusy(false)
    }
  }

  // ชื่อที่จับคู่ไม่ได้ — จากการซิงก์รอบนี้ หรือจากผลซิงก์ล่าสุดที่บันทึกไว้
  // (ซิงก์อัตโนมัติจากชีทก็ต้องแก้ได้ ไม่ใช่เฉพาะตอนกดซิงก์เอง)
  const unmatched = result?.unmatched ?? last?.unmatched ?? []

  // ดึง ID ของสเปรดชีตจากลิงก์ที่ตั้งไว้ เพื่อให้สคริปต์เปิดชีทได้ตรง ๆ
  // ลิงก์แบบเผยแพร่คือ /d/e/2PACX-... ซึ่งเป็นโทเคนเผยแพร่ ไม่ใช่ ID ของไฟล์
  const sheetId = (csvUrl.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/) || [])[1] || ''

  const appsScript = `// วางใน Apps Script ของชีท (ส่วนขยาย > Apps Script)
// หรือสร้างเป็นโปรเจกต์แยกก็ได้ เพราะเปิดชีทด้วย ID ตรง ๆ
// แล้วตั้ง Trigger แบบ Time-driven > Day timer ให้รันฟังก์ชัน syncSalesToPayroll
const PAYROLL_URL = '${origin || 'https://foodmarket-payroll.pages.dev'}/api/sales/sync'
const SYNC_KEY = '${syncKey || '<กดสร้างคีย์ในหน้าซิงก์ก่อน>'}'
// ID ของสเปรดชีต (ส่วนที่อยู่หลัง /d/ ในลิงก์)
const SHEET_ID = '${sheetId || '<วางลิงก์ชีทในช่องด้านบนก่อน แล้วคัดลอกสคริปต์ใหม่>'}'
// ชื่อแท็บชีท เว้นว่างไว้ = ใช้แท็บแรก
const SHEET_NAME = '${sheetTab}'

function syncSalesToPayroll() {
  // getActiveSpreadsheet() ใช้ได้เฉพาะสคริปต์ที่ผูกกับชีทและเปิดชีทอยู่
  // จึงเปิดด้วย ID เป็นหลัก ทำให้ตั้ง Trigger รันเองได้โดยไม่ต้องเปิดชีท
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet()
  if (!ss) throw new Error('เปิดสเปรดชีตไม่ได้ — ตรวจ SHEET_ID และสิทธิ์เข้าถึงไฟล์')
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0]
  if (!sheet) throw new Error('ไม่พบแท็บชีทชื่อ ' + SHEET_NAME)

  const values = sheet.getDataRange().getValues()
  const rows = []
  const norm = v => String(v == null ? '' : v).replace(/[\\s_\\-.]/g, '').toLowerCase()
  const toNum = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null
    const c = String(v == null ? '' : v).replace(/[,\\s฿]/g, '')
    if (!c) return null
    const n = Number(c)
    return isFinite(n) ? n : null
  }

  // ── รูปแบบที่ 1: รายการ (วันที่ / สาขา / ยอดขาย อยู่คนละคอลัมน์) ──
  const header = values[0].map(norm)
  const iDate = header.findIndex(h => ['date','วันที่'].indexOf(h) >= 0)
  const iBranch = header.findIndex(h => ['branch','สาขา','จุดขาย'].indexOf(h) >= 0)
  const iAmount = header.findIndex(h => ['amount','ยอดขาย','ยอด'].indexOf(h) >= 0)

  const fmt = d => Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd')

  if (iDate >= 0 && iBranch >= 0 && iAmount >= 0) {
    for (let i = 1; i < values.length; i++) {
      const r = values[i]
      if (!r[iBranch] || r[iAmount] === '') continue
      const d = r[iDate]
      rows.push({
        date: d instanceof Date ? fmt(d) : String(d),
        branch: String(r[iBranch]),
        amount: r[iAmount],
      })
    }
  } else {
    // ── รูปแบบที่ 2: ตารางไขว้ (แถว = วัน, คอลัมน์ = สาขา) ──
    const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                         'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

    // หาแถวหัวตาราง เช่น "วัน/สาขา | อโศก | พระราม 3 | ... | รวม"
    let hi = -1
    for (let i = 0; i < Math.min(values.length, 80); i++) {
      const first = norm(values[i][0])
      const filled = values[i].slice(1).filter(c => String(c || '').trim() !== '')
      if (filled.length >= 2 && (first.indexOf('วัน') >= 0 || first.indexOf('date') >= 0)) { hi = i; break }
    }
    if (hi < 0) throw new Error('ไม่พบคอลัมน์ วันที่ / สาขา / ยอดขาย และไม่พบหัวตารางแบบไขว้')

    // เดือน/ปี จากข้อความเหนือหัวตาราง เช่น "ยอดขายรายวันตามสาขา — กันยายน 2569"
    let year = 0, month = 0
    for (let i = hi; i >= 0 && i > hi - 6; i--) {
      const text = values[i].join(' ')
      const mi = THAI_MONTHS.findIndex(m => text.indexOf(m) >= 0)
      const ym = text.match(/(\\d{4})/)
      if (mi >= 0 && ym) {
        year = Number(ym[1]); if (year > 2400) year -= 543
        month = mi + 1
        break
      }
    }
    if (!year) { const t = new Date(); year = t.getFullYear(); month = t.getMonth() + 1 }

    const cols = []
    for (let c = 1; c < values[hi].length; c++) {
      const name = String(values[hi][c] || '').trim()
      if (!name) continue
      if (norm(name).indexOf('รวม') === 0 || norm(name) === 'total') continue
      cols.push({ c: c, name: name })
    }
    if (cols.length === 0) throw new Error('ไม่พบคอลัมน์สาขาในหัวตาราง')

    for (let i = hi + 1; i < values.length; i++) {
      const label = values[i][0]
      const text = String(label == null ? '' : label).trim()
      if (!text) continue
      if (norm(text).indexOf('รวม') === 0) break

      let date = null
      if (label instanceof Date) {
        date = fmt(label)
      } else {
        // "อ 1/9" — ตัดชื่อวันออก เหลือ วัน/เดือน แล้วเติมปีจากหัวตาราง
        const m = text.match(/(\\d{1,2})\\s*[/-]\\s*(\\d{1,2})/)
        if (m) {
          const dd = Number(m[1]), mm = Number(m[2])
          if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
            date = year + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2)
          }
        }
      }
      if (!date) continue

      for (let k = 0; k < cols.length; k++) {
        const amount = toNum(values[i][cols[k].c])
        // ว่างหรือศูนย์ = ยังไม่มียอดขาย ข้ามไปไม่ให้ทับของเดิม
        if (amount === null || amount === 0) continue
        rows.push({ date: date, branch: cols[k].name, amount: amount })
      }
    }
  }

  if (rows.length === 0) throw new Error('ไม่พบข้อมูลยอดขายในชีท')

  const res = UrlFetchApp.fetch(PAYROLL_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sync-Key': SYNC_KEY },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true,
  })
  const body = res.getContentText()
  Logger.log(body)
  // โยน error เมื่อไม่สำเร็จ เพื่อให้ Trigger แจ้งเตือนทางอีเมล
  if (res.getResponseCode() >= 300) throw new Error('ซิงก์ไม่สำเร็จ: ' + body)
}`

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ซิงก์ยอดขายจาก Google Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">
          ดึงยอดขายรายสาขาจากชีทเข้าระบบ ใช้คำนวณ incentive ให้อัตโนมัติ
          ซิงก์ซ้ำได้ไม่ซ้ำซ้อน — รายการของ &quot;สาขา + วันที่&quot; เดิมที่มาจากชีทจะถูกแทนที่
          ส่วนรายการที่คีย์เองในระบบจะไม่ถูกแตะ
        </p>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* วิธีที่ 1 — ระบบไปดึงเอง */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">วิธีที่ 1 — ระบบไปดึงจากลิงก์ชีท</h2>
        <p className="text-xs text-gray-500">
          ในชีทเลือก ไฟล์ &gt; แชร์ &gt; เผยแพร่ทางเว็บ &gt; เลือกชีทที่ต้องการ และเลือกรูปแบบ
          <strong> CSV</strong> แล้วนำลิงก์มาวางที่นี่ (วางลิงก์ชีทปกติก็ได้ ระบบจะแปลงให้)
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            value={csvUrl}
            onChange={e => setCsvUrl(e.target.value)}
          />
          <button
            onClick={() => saveSettings({ csv_url: csvUrl })}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            บันทึกลิงก์
          </button>
          <button
            onClick={syncNow}
            disabled={busy || !csvUrl}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? 'กำลังซิงก์...' : 'ซิงก์เดี๋ยวนี้'}
          </button>
        </div>
      </div>

      {/* วิธีที่ 2 — ชีทส่งมาเอง */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">วิธีที่ 2 — ให้ชีทส่งมาเองทุกวัน (แนะนำ)</h2>
        <p className="text-xs text-gray-500">
          สร้างคีย์แล้วนำสคริปต์ด้านล่างไปวางใน Apps Script ของชีท
          จากนั้นตั้ง Trigger แบบ Time-driven &gt; Day timer เลือกช่วงเวลาที่ต้องการ
          ข้อมูลจะส่งเข้าระบบเองทุกวันโดยไม่ต้องเผยแพร่ชีทให้คนนอกเห็น
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            readOnly
            className="flex-1 min-w-[240px] border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-gray-50"
            value={syncKey || '(ยังไม่มีคีย์)'}
          />
          <input
            type="text"
            className="w-44 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="ชื่อแท็บชีท (ไม่ใส่ = แท็บแรก)"
            value={sheetTab}
            onChange={e => setSheetTab(e.target.value)}
          />
          <button
            onClick={() => { const k = randomKey(); setSyncKey(k); saveSettings({ sync_key: k }) }}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            {syncKey ? 'สร้างคีย์ใหม่' : 'สร้างคีย์'}
          </button>
          <button
            onClick={() => navigator.clipboard?.writeText(appsScript)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            คัดลอกสคริปต์
          </button>
        </div>
        {!sheetId && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-xs">
            ยังไม่ได้ใส่ลิงก์ชีทในวิธีที่ 1 — สคริปต์จะไม่มี SHEET_ID
            ให้วางลิงก์ชีทแล้วกดบันทึกก่อน จากนั้นคัดลอกสคริปต์ใหม่
          </div>
        )}
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-[11px] leading-relaxed overflow-x-auto">
{appsScript}
        </pre>
      </div>

      {/* สถานะและผลล่าสุด */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">สถานะการซิงก์</h2>
        {loading ? (
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        ) : last ? (
          <div className="text-sm text-gray-700 space-y-1">
            <p>
              ล่าสุด {last.at} ({last.via === 'auto' ? 'อัตโนมัติจากชีท' : 'กดเอง'}) ·
              นำเข้า <strong>{last.imported}</strong> รายการ ·
              แทนที่ของเดิม {last.replaced} · ข้าม {last.skipped}
            </p>
            {last.unmatched?.length > 0 && (
              <p className="text-amber-700">
                จับคู่สาขาไม่ได้: {last.unmatched.map(u => `${u.branch} (${u.rows})`).join(', ')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">ยังไม่เคยซิงก์</p>
        )}

        {unmatched.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 space-y-2">
            <p className="font-medium">ชื่อสาขาในชีทที่จับคู่ไม่ได้ — เลือกว่าตรงกับสาขาไหน</p>
            {unmatched.map(u => (
              <div key={u.branch} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[140px] font-mono text-xs">{u.branch}</span>
                <span className="text-xs text-amber-700">({u.rows} แถว)</span>
                <select
                  className="border border-amber-300 rounded-lg px-2 py-1 text-xs bg-white text-gray-800"
                  value={aliases[u.branch] ?? '__unset__'}
                  onChange={e => {
                    const v = e.target.value
                    setAliases(prev => {
                      const next = { ...prev }
                      if (v === '__unset__') delete next[u.branch]
                      else next[u.branch] = v === '__skip__' ? '' : v
                      return next
                    })
                  }}
                >
                  <option value="__unset__">-- ยังไม่จับคู่ --</option>
                  <option value="__skip__">ไม่นำเข้าชื่อนี้</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ))}
            <button
              onClick={() => saveSettings({ aliases })}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
            >
              บันทึกการจับคู่ แล้วซิงก์ใหม่อีกครั้ง
            </button>
          </div>
        )}

        {Object.keys(aliases).length > 0 && (
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">การจับคู่ที่บันทึกไว้: </span>
            {Object.entries(aliases).map(([k, v]) =>
              `${k} → ${v ? (branches.find(b => b.id === v)?.name || v) : 'ไม่นำเข้า'}`
            ).join(' · ')}
          </div>
        )}

        {result && result.skipped.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600">
            <p className="font-medium text-gray-700">แถวที่ข้าม ({result.skipped.length})</p>
            <ul className="mt-1 space-y-0.5">
              {result.skipped.slice(0, 10).map(s => (
                <li key={s.line}>บรรทัด {s.line}: {s.reason} — {s.raw}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-xs text-gray-500">
          <p className="font-medium text-gray-700 mb-1">สาขาในระบบ (ชื่อในชีทต้องตรงหรือใกล้เคียง)</p>
          <p>{branches.map(b => b.name).join(' · ') || '-'}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <p className="font-medium">รูปแบบชีทที่รองรับ</p>
        <p className="mt-1">
          <strong>แบบที่ 1 รายการ</strong> — มีหัวคอลัมน์ วันที่ (หรือ date), สาขา (หรือ branch/จุดขาย)
          และ ยอดขาย (หรือ amount) จะมีคอลัมน์อื่นเพิ่มก็ได้
        </p>
        <p className="mt-1">
          <strong>แบบที่ 2 ตารางไขว้</strong> — แถวคือวัน คอลัมน์คือสาขา เช่นหัวตาราง
          &quot;วัน/สาขา | อโศก | พระราม 3 | ...&quot; ระบบจะข้ามคอลัมน์ &quot;รวม&quot;
          และหยุดอ่านที่แถว &quot;รวมทั้งเดือน&quot; วันที่เขียนสั้นแบบ &quot;อ 1/9&quot; ได้
          โดยเอาปีจากหัวตาราง เช่น &quot;— กันยายน 2569&quot; ช่องที่เป็น 0 หรือว่างจะไม่นำเข้า
        </p>
        <p className="mt-1">
          วันที่รองรับ 2026-09-13, 13/09/2026 และ 13/09/2569 (พ.ศ.) · ยอดขายใส่คอมมาได้
        </p>
      </div>
    </div>
  )
}
