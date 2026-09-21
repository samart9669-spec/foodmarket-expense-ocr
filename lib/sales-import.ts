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

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** หาเดือน/ปีจากข้อความหัวตาราง เช่น "ยอดขายรายวันตามสาขา — กันยายน 2569" */
export function findMonthYear(text: string): { year: number; month: number } | null {
  const idx = THAI_MONTHS.findIndex(m => text.includes(m))
  if (idx < 0) return null
  const ym = text.match(/(\d{4})/)
  if (!ym) return null
  let year = Number(ym[1])
  if (year > 2400) year -= 543
  return { year, month: idx + 1 }
}

/**
 * วันที่ในชีทแบบตารางไขว้มักเขียนสั้น เช่น "อ 1/9" (ชื่อวันไทย + วัน/เดือน)
 * จึงตัดชื่อวันออกแล้วเติมปีจากหัวตาราง
 */
export function parseShortDate(
  input: string,
  fallback: { year: number; month: number } | null,
): string | null {
  const s = (input || '').trim()
  if (!s) return null

  // มีปีครบอยู่แล้ว ใช้ตัวแปลงปกติ
  const full = normalizeDate(s)
  if (full) return full

  // ตัดชื่อวันไทยหรืออังกฤษที่นำหน้าออก เหลือเฉพาะตัวเลข
  const m = s.match(/(\d{1,2})\s*[/-]\s*(\d{1,2})/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (!fallback) return null
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  // ถ้าเดือนในเซลล์ไม่ตรงกับเดือนของตาราง ให้ยึดเดือนในเซลล์
  return `${fallback.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** คอลัมน์ที่ไม่ใช่สาขา ในตารางไขว้ */
function isTotalColumn(name: string): boolean {
  const k = normalizeKey(name)
  return !k || k === 'รวม' || k === 'total' || k.startsWith('รวม')
}

/**
 * ตารางไขว้: แถวคือวัน คอลัมน์คือสาขา เช่น
 *   วัน/สาขา | อโศก | พระราม 3 | แฟชั่น 3 | ... | รวม
 *   อ 1/9    | 18,189 | 12,226 | 5,215  | ... | 47,490
 */
function parseMatrixCsv(lines: string[]): ParseResult | null {
  const result: ParseResult = { rows: [], skipped: [] }

  // หาแถวหัวตาราง: ช่องแรกพูดถึง "วัน" และมีคอลัมน์อื่นอย่างน้อย 2 ช่อง
  let headerIdx = -1
  let cols: string[] = []
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const cells = splitCsvLine(lines[i])
    const first = normalizeKey(cells[0] || '')
    const filled = cells.slice(1).filter(c => c.trim() !== '')
    if (filled.length >= 2 && (first.includes('วัน') || first.includes('date'))) {
      headerIdx = i
      cols = cells
      break
    }
  }
  if (headerIdx < 0) return null

  // เดือน/ปี จากข้อความเหนือหัวตาราง
  let monthYear: { year: number; month: number } | null = null
  for (let i = headerIdx; i >= 0 && i > headerIdx - 6; i--) {
    monthYear = findMonthYear(lines[i])
    if (monthYear) break
  }

  const branchCols: Array<{ index: number; name: string }> = []
  for (let c = 1; c < cols.length; c++) {
    const name = (cols[c] || '').trim()
    if (!name || isTotalColumn(name)) continue
    branchCols.push({ index: c, name })
  }
  if (branchCols.length === 0) return null

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const label = (cells[0] || '').trim()
    if (!label) continue
    // แถวสรุปท้ายตาราง จบการอ่าน
    if (normalizeKey(label).startsWith('รวม')) break

    const date = parseShortDate(label, monthYear)
    if (!date) {
      result.skipped.push({ line: i + 1, reason: 'อ่านวันที่ไม่ได้', raw: lines[i].slice(0, 120) })
      continue
    }

    for (const col of branchCols) {
      const amount = normalizeAmount(cells[col.index] ?? '')
      // ช่องว่างหรือศูนย์ = ยังไม่มียอดขายวันนั้น ข้ามไปไม่บันทึกทับของเดิม
      if (amount === null || amount === 0) continue
      result.rows.push({ date, branch: col.name, amount, notes: null })
    }
  }

  return result
}

/** แปลง CSV ทั้งไฟล์เป็นแถวยอดขาย รองรับทั้งแบบรายการและตารางไขว้ */
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
    // ไม่ใช่รูปแบบรายการ ลองอ่านแบบตารางไขว้ (แถว = วัน, คอลัมน์ = สาขา)
    const matrix = parseMatrixCsv(lines)
    if (matrix && matrix.rows.length > 0) return matrix

    result.skipped.push({
      line: 1,
      reason: 'ไม่พบหัวคอลัมน์ที่ต้องมี (วันที่ / สาขา / ยอดขาย) และอ่านแบบตารางไขว้ไม่สำเร็จ',
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
