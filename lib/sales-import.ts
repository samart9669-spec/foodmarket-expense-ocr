/**
 * นำเข้ายอดขายรายสาขาจาก Google Sheet
 *
 * รองรับทั้งแบบที่ชีทส่งข้อมูลมาเอง (Apps Script) และแบบที่ระบบไปดึง CSV
 * ที่เผยแพร่ไว้ ตัวแปลงยอมรับชื่อคอลัมน์ได้หลายแบบ เพราะชีทที่ใช้งานจริง
 * มักตั้งหัวคอลัมน์เป็นภาษาไทยและไม่ตรงกันทุกไฟล์
 */

export interface RawSalesRow {
  date?: string
  branch?: string
  amount?: string | number
  notes?: string
}

export interface ParsedSalesRow {
  date: string
  branch: string
  amount: number
  notes: string | null
}

export interface ParseResult {
  rows: ParsedSalesRow[]
  /** แถวที่ข้ามไป พร้อมเหตุผล สำหรับแสดงให้ผู้ใช้ตรวจ */
  skipped: Array<{ line: number; reason: string; raw: string }>
}

/** ชื่อคอลัมน์ที่ยอมรับสำหรับแต่ละค่า (เทียบแบบไม่สนตัวพิมพ์และช่องว่าง) */
const HEADER_ALIASES: Record<'date' | 'branch' | 'amount' | 'notes', string[]> = {
  date: ['date', 'วันที่', 'วัน', 'saledate', 'sales_date', 'วันที่ขาย'],
  branch: ['branch', 'สาขา', 'จุดขาย', 'shop', 'store', 'salespoint', 'sales_point', 'ร้าน'],
  amount: ['amount', 'ยอดขาย', 'ยอด', 'sales', 'total', 'ยอดรวม', 'จำนวนเงิน'],
  notes: ['notes', 'note', 'หมายเหตุ', 'remark'],
}

function normalizeKey(s: string): string {
  return s.replace(/[\s_\-.]/g, '').toLowerCase()
}

/** แยกบรรทัด CSV โดยรองรับค่าที่อยู่ในเครื่องหมายคำพูดและมีคอมมาข้างใน */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map(v => v.trim())
}

/**
 * แปลงวันที่ให้เป็น YYYY-MM-DD รองรับ
 *  - 2026-09-13
 *  - 13/09/2026 และ 13/09/2569 (พ.ศ.)
 *  - 9/13/2026 (รูปแบบอเมริกัน จะเดาจากค่าที่เกิน 12)
 */
export function normalizeDate(input: string): string | null {
  const s = (input || '').trim()
  if (!s) return null

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3])
    return isValidYMD(y, m, d) ? fmt(y, m, d) : null
  }

  const slash = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (slash) {
    let a = Number(slash[1]), b = Number(slash[2])
    let y = Number(slash[3])
    // ปี พ.ศ. มากกว่า ค.ศ. อยู่ 543
    if (y > 2400) y -= 543
    // ถ้าตัวแรกเกิน 12 แปลว่าเป็นวัน มิฉะนั้นถือเป็น วัน/เดือน แบบไทย
    let d = a, m = b
    if (a <= 12 && b > 12) { m = a; d = b }
    return isValidYMD(y, m, d) ? fmt(y, m, d) : null
  }

  return null
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (!y || !m || !d) return false
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  if (y < 2000 || y > 2100) return false
  return true
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** ตัดคอมมาและสัญลักษณ์สกุลเงินออกก่อนแปลงเป็นตัวเลข */
export function normalizeAmount(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const cleaned = (input || '').toString().replace(/[,\s฿]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** แปลง CSV ทั้งไฟล์เป็นแถวยอดขาย */
export function parseSalesCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '')
  const result: ParseResult = { rows: [], skipped: [] }
  if (lines.length === 0) return result

  const header = splitCsvLine(lines[0]).map(normalizeKey)
  const indexOf = (field: keyof typeof HEADER_ALIASES): number => {
    const aliases = HEADER_ALIASES[field].map(normalizeKey)
    return header.findIndex(h => aliases.includes(h))
  }

  const iDate = indexOf('date')
  const iBranch = indexOf('branch')
  const iAmount = indexOf('amount')
  const iNotes = indexOf('notes')

  if (iDate < 0 || iBranch < 0 || iAmount < 0) {
    result.skipped.push({
      line: 1,
      reason: 'ไม่พบหัวคอลัมน์ที่ต้องมี (วันที่ / สาขา / ยอดขาย)',
      raw: lines[0].slice(0, 120),
    })
    return result
  }

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const rawLine = lines[i].slice(0, 120)
    const date = normalizeDate(cells[iDate] || '')
    const branch = (cells[iBranch] || '').trim()
    const amount = normalizeAmount(cells[iAmount] ?? '')

    if (!date) { result.skipped.push({ line: i + 1, reason: 'วันที่ไม่ถูกต้อง', raw: rawLine }); continue }
    if (!branch) { result.skipped.push({ line: i + 1, reason: 'ไม่ระบุสาขา', raw: rawLine }); continue }
    if (amount === null) { result.skipped.push({ line: i + 1, reason: 'ยอดขายไม่ใช่ตัวเลข', raw: rawLine }); continue }

    result.rows.push({
      date,
      branch,
      amount,
      notes: iNotes >= 0 ? (cells[iNotes] || null) : null,
    })
  }

  return result
}

/** จับคู่ชื่อสาขาจากชีทกับสาขาในระบบ แบบไม่สนตัวพิมพ์และช่องว่าง */
export function matchBranch(
  branches: Array<{ id: string; name: string }>,
  name: string,
): { id: string; name: string } | null {
  const key = normalizeKey(name)
  if (!key) return null
  const exact = branches.find(b => normalizeKey(b.name) === key)
  if (exact) return exact
  // ชื่อในชีทมักสั้นกว่า เช่น "T21 Rama3" กับ "จุดขาย 5 - T21 พระราม 3"
  const contains = branches.filter(b => {
    const bk = normalizeKey(b.name)
    return bk.includes(key) || key.includes(bk)
  })
  return contains.length === 1 ? contains[0] : null
}

/** แปลง Google Sheet URL ปกติให้เป็นลิงก์ export CSV ถ้าเป็นไปได้ */
export function toCsvUrl(url: string): string {
  const trimmed = (url || '').trim()
  if (!trimmed) return ''
  // ลิงก์ที่เผยแพร่แล้ว (pub?output=csv) ใช้ได้เลย
  if (/output=csv/.test(trimmed)) return trimmed
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return trimmed
  const id = m[1]
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}
