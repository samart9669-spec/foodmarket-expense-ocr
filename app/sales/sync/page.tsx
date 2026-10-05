'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { getAuthHeaders } from '@/lib/utils'

interface LastSync {
  at: string
  via: string
  imported: number
  replaced: number
  replaced_manual?: number
  duplicates?: number
  skipped: number
  unmatched: Array<{ branch: string; rows: number }>
}

interface SyncResult {
  imported: number
  replaced: number
  replaced_manual?: number
  duplicates?: number
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

  // ล้างยอดซ้ำที่ค้างจากการซิงก์รุ่นก่อน — เหลือสาขาละรายการต่อวัน
  const dedupe = async () => {
    if (!confirm('ตรวจหายอดขายที่ซ้ำกันของสาขาเดียวกันในวันเดียวกัน แล้วเก็บไว้รายการเดียว?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/sales/sync', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedupe' }),
      })
      const d = await res.json() as any
      if (!res.ok) { setToast({ msg: d.error || 'ล้างรายการซ้ำไม่สำเร็จ', ok: false }); return }
      setToast({
        msg: d.removed > 0
          ? `ล้างรายการซ้ำแล้ว ${d.removed} รายการ จาก ${d.pairs} วัน/สาขา`
          : 'ไม่พบยอดขายที่ซ้ำกัน',
        ok: true,
      })
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
// แล้วตั้ง Trigger แบบ Time-driven > Day timer ให้รันฟังก์ชัน syncSalesToPayroll
const PAYROLL_URL = '${origin || 'https://foodmarket-payroll.pages.dev'}/api/sales/sync'
const SYNC_KEY = '${syncKey || '<กดสร้างคีย์ในหน้าซิงก์ก่อน>'}'
// ID ของสเปรดชีต (ส่วนที่อยู่หลัง /d/ ในลิงก์)
const SHEET_ID = '${sheetId || '<วางลิงก์ชีทในช่องด้านบนก่อน แล้วคัดลอกสคริปต์ใหม่>'}'
// ชื่อแท็บชีท — เว้นว่างไว้ = อ่านทุกแท็บ ขึ้นเดือนใหม่แล้วเพิ่มแท็บก็ไม่ต้องแก้สคริปต์
// ถ้าจะระบุเอง ใส่หลายแท็บได้ คั่นด้วยคอมมา เช่น 'ก.ย. 69, ต.ค. 69'
const SHEET_NAME = '${sheetTab}'

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
// ชื่อย่อหลังตัดจุดออก เช่น "ต.ค." -> "ตค" แท็บรายเดือนมักตั้งชื่อแบบนี้
const THAI_MONTHS_SHORT = ['มค','กพ','มีค','เมย','พค','มิย','กค','สค','กย','ตค','พย','ธค']

function norm_(v) {
  return String(v == null ? '' : v).replace(/[\\s_\\-.]/g, '').toLowerCase()
}

function toNum_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null
  const c = String(v == null ? '' : v).replace(/[,\\s฿]/g, '')
  if (!c) return null
  const n = Number(c)
  return isFinite(n) ? n : null
}

function fmtDate_(d) {
  return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd')
}

function syncSalesToPayroll() {
  // getActiveSpreadsheet() ใช้ได้เฉพาะสคริปต์ที่ผูกกับชีทและเปิดชีทอยู่
  // จึงเปิดด้วย ID เป็นหลัก ทำให้ตั้ง Trigger รันเองได้โดยไม่ต้องเปิดชีท
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet()
  if (!ss) throw new Error('เปิดสเปรดชีตไม่ได้ — ตรวจ SHEET_ID และสิทธิ์เข้าถึงไฟล์')

  // เว้น SHEET_NAME ว่าง = อ่านทุกแท็บ เดือนใหม่ที่แยกแท็บจะเข้าเองโดยไม่ต้องแก้อะไร
  const wanted = SHEET_NAME.split(',').map(function (s) { return s.trim() }).filter(function (s) { return s !== '' })
  let sheets
  if (wanted.length === 0) {
    sheets = ss.getSheets()
  } else {
    sheets = wanted.map(function (n) {
      const sh = ss.getSheetByName(n)
      if (!sh) throw new Error('ไม่พบแท็บชีทชื่อ ' + n)
      return sh
    })
  }

  let rows = []
  const report = []
  const samples = []
  for (let s = 0; s < sheets.length; s++) {
    const got = readSheetRows_(sheets[s])
    report.push(sheets[s].getName() + ' = ' + got.length)
    if (got.length === 0) samples.push(sheets[s].getName() + ': ' + peek_(sheets[s]))
    rows = rows.concat(got)
  }
  Logger.log('อ่านจากแท็บ: ' + report.join(' | '))

  if (rows.length === 0) {
    // แนบหัวตารางที่เห็นในแต่ละแท็บ จะได้รู้ว่าชีทวางข้อมูลแบบไหนโดยไม่ต้องเดา
    Logger.log('หัวตารางที่เห็น:\\n' + samples.join('\\n'))
    throw new Error('ไม่พบข้อมูลยอดขายในชีท (อ่านแล้ว ' + sheets.length + ' แท็บ: ' + report.join(' | ') +
                    ') — หัวตารางที่เห็น: ' + samples.join(' // '))
  }

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
}

/** อ่านยอดขายจากแท็บเดียว คืน [] ถ้าอ่านไม่ได้ เพื่อให้แท็บอื่นยังซิงก์ต่อได้ */
function readSheetRows_(sheet) {
  const values = sheet.getDataRange().getValues()
  if (values.length === 0) return []

  // ── รูปแบบที่ 1: รายการ (วันที่ / สาขา / ยอดขาย อยู่คนละคอลัมน์) ──
  const header = values[0].map(norm_)
  const iDate = header.findIndex(function (h) { return ['date','วันที่'].indexOf(h) >= 0 })
  const iBranch = header.findIndex(function (h) { return ['branch','สาขา','จุดขาย'].indexOf(h) >= 0 })
  const iAmount = header.findIndex(function (h) { return ['amount','ยอดขาย','ยอด'].indexOf(h) >= 0 })

  const rows = []
  if (iDate >= 0 && iBranch >= 0 && iAmount >= 0) {
    for (let i = 1; i < values.length; i++) {
      const r = values[i]
      if (!r[iBranch] || r[iAmount] === '') continue
      const d = r[iDate]
      rows.push({
        date: d instanceof Date ? fmtDate_(d) : String(d),
        branch: String(r[iBranch]),
        amount: r[iAmount],
      })
    }
    return rows
  }

  // ── รูปแบบที่ 2: ตารางไขว้ (แถว = วัน, คอลัมน์ = สาขา) ──
  // ชีทจริงมักวางตารางของเดือนใหม่ต่อท้ายเดือนเก่าในแท็บเดียวกัน จึงอ่านทุกบล็อก
  // ถ้าในตารางไม่ได้เขียนเดือนไว้ ใช้เดือนจากชื่อแท็บ เช่นแท็บ "ต.ค. 69"
  let lastMY = monthYearOf_(sheet.getName())
  for (let hi = 0; hi < values.length; hi++) {
    if (!isMatrixHeader_(values, hi)) continue

    const my = monthYearAbove_(values, hi) || lastMY
    if (my) lastMY = my

    const cols = []
    for (let c = 1; c < values[hi].length; c++) {
      const name = String(values[hi][c] || '').trim()
      if (!name) continue
      if (norm_(name).indexOf('รวม') === 0 || norm_(name) === 'total') continue
      cols.push({ c: c, name: name })
    }
    if (cols.length === 0) continue

    let r = hi + 1
    for (; r < values.length; r++) {
      // ตารางของเดือนถัดไป ปล่อยให้วงนอกเริ่มบล็อกใหม่
      if (isMatrixHeader_(values, r)) break
      const label = values[r][0]
      const text = String(label == null ? '' : label).trim()
      if (!text) continue
      // แถวสรุปท้ายตาราง จบบล็อกนี้
      if (norm_(text).indexOf('รวม') === 0) break

      let date = null
      if (label instanceof Date) {
        date = fmtDate_(label)
      } else {
        // "อ 1/9" — ตัดชื่อวันออก เหลือ วัน/เดือน แล้วเติมปีจากหัวตาราง
        const m = text.match(/(\\d{1,2})\\s*[/-]\\s*(\\d{1,2})/)
        if (m && my) {
          const dd = Number(m[1]), mm = Number(m[2])
          if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
            date = my.year + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2)
          }
        }
      }
      if (!date) continue

      for (let k = 0; k < cols.length; k++) {
        const amount = toNum_(values[r][cols[k].c])
        // ว่างหรือศูนย์ = ยังไม่มียอดขาย ข้ามไปไม่ให้ทับของเดิม
        if (amount === null || amount === 0) continue
        rows.push({ date: date, branch: cols[k].name, amount: amount })
      }
    }
    hi = r - 1
  }

  return rows
}

/** หัวตารางไขว้: มีคอลัมน์สาขาอย่างน้อย 2 ช่อง และช่องซ้ายบนพูดถึง "วัน"
 *  บางชีทปล่อยช่องซ้ายบนว่างไว้ จึงรับด้วยถ้าแถวถัดไปขึ้นต้นเป็นวันที่ */
function isMatrixHeader_(values, i) {
  const row = values[i]
  if (!row) return false
  let filled = 0
  for (let c = 1; c < row.length; c++) if (String(row[c] || '').trim() !== '') filled++
  if (filled < 2) return false
  const first = norm_(row[0])
  if (first.indexOf('วัน') >= 0 || first.indexOf('date') >= 0) return true
  if (first === '') return isDayLabel_(values[i + 1] ? values[i + 1][0] : null)
  return false
}

/** ป้ายแถวที่เป็นวัน เช่น "อ 1/9", "1/10" หรือช่องที่เป็นวันที่จริง */
function isDayLabel_(cell) {
  if (cell instanceof Date) return true
  const s = String(cell == null ? '' : cell).trim()
  if (!s) return false
  return /(\\d{1,2})\\s*[/-]\\s*(\\d{1,2})/.test(s)
}

/** 4 แถวแรกของแท็บแบบย่อ ไว้บอกว่าชีทวางข้อมูลแบบไหนเมื่ออ่านไม่ออก */
function peek_(sheet) {
  const v = sheet.getDataRange().getValues().slice(0, 4)
  return v.map(function (row) {
    return row.slice(0, 5).map(function (c) {
      return String(c == null ? '' : c).trim().slice(0, 18)
    }).join(' | ')
  }).join(' ⏎ ')
}

/** เดือน/ปี จากข้อความเหนือหัวตาราง เช่น "ยอดขายรายวันตามสาขา — ตุลาคม 2569" */
function monthYearAbove_(values, hi) {
  for (let i = hi; i >= 0 && i > hi - 6; i--) {
    const my = monthYearOf_(values[i].join(' '))
    if (my) return my
  }
  return null
}

/**
 * หาเดือน/ปีจากข้อความ รองรับชื่อย่อและปีสองหลัก เช่น "ต.ค. 69"
 * ไม่เดาปีจากวันนี้ เพราะต้องได้ผลเท่าเดิมทุกครั้งที่ซิงก์
 */
function monthYearOf_(text) {
  let mi = -1
  for (let m = 0; m < THAI_MONTHS.length; m++) {
    if (text.indexOf(THAI_MONTHS[m]) >= 0) { mi = m; break }
  }
  if (mi < 0) {
    const key = text.replace(/[\\s.]/g, '')
    for (let m = 0; m < THAI_MONTHS_SHORT.length; m++) {
      if (key.indexOf(THAI_MONTHS_SHORT[m]) >= 0) { mi = m; break }
    }
  }
  if (mi < 0) return null

  // ปีสี่หลักมาก่อน ถ้าไม่มีจึงรับปีสองหลัก ("69" = พ.ศ. 2569)
  const four = text.match(/(\\d{4})/)
  let y
  if (four) {
    y = Number(four[1])
  } else {
    const two = text.match(/(?:^|[^\\d])(\\d{2})(?:[^\\d]|$)/)
    if (!two) return null
    y = 2500 + Number(two[1])
  }
  if (y > 2400) y -= 543
  if (y < 2000 || y > 2100) return null
  return { year: y, month: mi + 1 }
}`

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ซิงก์ยอดขายจาก Google Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">
          ดึงยอดขายรายสาขาจากชีทเข้าระบบ ใช้คำนวณ incentive ให้อัตโนมัติ
          ซิงก์กี่ครั้งยอดก็ไม่เบิ้ล — หนึ่งสาขามียอดได้วันละรายการเดียว
          ยอดจากชีทจะแทนที่ของเดิมของ &quot;สาขา + วันที่&quot; นั้น รวมถึงที่เคยคีย์เองไว้
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
          <br />
          ลิงก์หนึ่งอันได้แท็บเดียว ถ้าแยกแท็บตามเดือน ให้วางหลายลิงก์คั่นด้วยการขึ้นบรรทัดใหม่
          หรือใช้วิธีที่ 2 ซึ่งอ่านทุกแท็บให้เอง
        </p>
        <div className="flex flex-wrap gap-2">
          <textarea
            rows={2}
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
          <br />
          เว้นชื่อแท็บว่างไว้ = อ่านทุกแท็บ ขึ้นเดือนใหม่แล้วเพิ่มแท็บก็ไม่ต้องแก้สคริปต์
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
            placeholder="ชื่อแท็บชีท (ไม่ใส่ = ทุกแท็บ)"
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
              {(last.replaced_manual ?? 0) > 0 && ` · ทับรายการที่คีย์เอง ${last.replaced_manual}`}
              {(last.duplicates ?? 0) > 0 && ` · รวมช่องซ้ำในชีท ${last.duplicates}`}
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

        {/* ยอดที่เบิ้ลอยู่แล้วจากการซิงก์รุ่นก่อน ล้างได้จากตรงนี้ */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={dedupe}
            disabled={busy}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
          >
            ล้างยอดขายที่ซ้ำ
          </button>
          <span className="text-xs text-gray-500">
            ถ้าเคยซิงก์แล้วยอดเบิ้ล กดปุ่มนี้เพื่อให้เหลือสาขาละรายการต่อวัน
          </span>
        </div>

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
