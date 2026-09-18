/**
 * ใบทำจ่ายและใบจ่ายเงินเดือน ตามแบบฟอร์มที่ใช้งานจริง
 *
 * อ้างอิงสูตรจากไฟล์ต้นฉบับ (ชีท "ทำจ่าย NEW")
 *   รวมเงินได้        = เงินเดือน + ค่าล่วงเวลา + เบี้ยขยัน + เงินได้อื่น
 *   รวมเงินหัก        = ขาด/ลา + หักอื่น ๆ
 *   ยอดจ่ายก่อนภาษี   = รวมเงินได้ - รวมเงินหัก
 *   mark up          = ยอดจ่ายก่อนภาษี x 1.03093
 *   หักภาษี 3%        = mark up x 0.03
 *   สุทธิ             = mark up - หักภาษี
 * การบวก mark up แล้วหักภาษีกลับ ทำให้พนักงานได้รับเท่ากับยอดก่อนภาษีพอดี
 */

/** ตัวคูณ mark up ก่อนหักภาษี ตามที่ใช้ในฟอร์มต้นฉบับ */
export const MARKUP_FACTOR = 1.03093
/** อัตราภาษีหัก ณ ที่จ่าย */
export const TAX_RATE = 0.03

export interface PayslipInput {
  employee_name: string
  employee_type: string
  daily_rate: number
  ot_rate: number
  days_worked: number
  ot_hours_total: number
  day_rate_total: number
  ot_total: number
  diligence_allowance: number
  diligence_deduction: number
  incentive_total: number
  commission_total: number
  bonus: number
  deductions: number
  /** ยอดที่บริษัทคู่สัญญาร่วมจ่าย — หักออกจากยอดที่เราจ่าย */
  partner_share?: number
  notes?: string | null
}

export interface PayslipRow {
  name: string
  employee_type: string
  daily_rate: number
  ot_rate: number
  /** D — วันทำงาน */
  days: number
  /** E — ชม.ล่วงเวลา */
  ot_hours: number
  /** F — เงินเดือน */
  salary: number
  /** G — ค่าล่วงเวลา */
  ot_pay: number
  /** H — เบี้ยขยัน */
  diligence: number
  /** เงินได้อื่น ๆ ที่ไม่มีช่องแยกในฟอร์ม (incentive / คอม / โบนัส) */
  other_income: number
  /** I — รวมเงินได้ */
  gross: number
  /** J — ขาด/ลา */
  absent_deduct: number
  /** K — หักอื่น ๆ */
  other_deduct: number
  /** L — รวมเงินหัก */
  total_deduct: number
  /** M — หมายเหตุ */
  note: string
  /** N — ยอดจ่ายก่อนภาษี */
  before_tax: number
  /** O — mark up */
  markup: number
  /** P — หักภาษี 3% */
  tax: number
  /** Q — สุทธิ */
  net: number
  /** R — diff (ตรวจว่าสุทธิเท่ากับยอดก่อนภาษี) */
  diff: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildPayslipRow(input: PayslipInput): PayslipRow {
  const salary = input.day_rate_total || 0
  const ot_pay = input.ot_total || 0
  const diligence = input.diligence_allowance || 0

  // รายได้ที่ฟอร์มไม่มีช่องแยกไว้ รวมไว้ที่ "เงินได้อื่น ๆ" และอธิบายในหมายเหตุ
  const other_income = (input.incentive_total || 0) + (input.commission_total || 0) + (input.bonus || 0)

  const gross = salary + ot_pay + diligence + other_income

  const absent_deduct = 0
  // เบี้ยขยันที่ถูกหักเพราะมาสาย และส่วนที่คู่สัญญาร่วมจ่าย นับเป็นรายการหัก
  const other_deduct = (input.deductions || 0)
    + (input.diligence_deduction || 0)
    + (input.partner_share || 0)
  const total_deduct = absent_deduct + other_deduct

  const before_tax = gross - total_deduct
  const markup = before_tax * MARKUP_FACTOR
  const tax = markup * TAX_RATE
  const net = markup - tax

  const noteParts: string[] = []
  if (input.incentive_total) noteParts.push(`incentive ${round2(input.incentive_total).toLocaleString('th-TH')}`)
  if (input.commission_total) noteParts.push(`คอม ${round2(input.commission_total).toLocaleString('th-TH')}`)
  if (input.bonus) noteParts.push(`โบนัส ${round2(input.bonus).toLocaleString('th-TH')}`)
  if (input.diligence_deduction) noteParts.push(`หักเบี้ยขยัน ${round2(input.diligence_deduction).toLocaleString('th-TH')}`)
  if (input.partner_share) noteParts.push(`คู่สัญญาจ่าย ${round2(input.partner_share).toLocaleString('th-TH')}`)
  if (input.notes) noteParts.push(input.notes)

  return {
    name: input.employee_name,
    employee_type: input.employee_type,
    daily_rate: input.daily_rate || 0,
    ot_rate: input.ot_rate || 0,
    days: input.days_worked || 0,
    ot_hours: input.ot_hours_total || 0,
    salary: round2(salary),
    ot_pay: round2(ot_pay),
    diligence: round2(diligence),
    other_income: round2(other_income),
    gross: round2(gross),
    absent_deduct,
    other_deduct: round2(other_deduct),
    total_deduct: round2(total_deduct),
    note: noteParts.join(' · '),
    before_tax: round2(before_tax),
    markup: round2(markup),
    tax: round2(tax),
    net: round2(net),
    diff: round2(net - before_tax),
  }
}

export interface PayslipTotals {
  days: number; ot_hours: number; salary: number; ot_pay: number; diligence: number
  other_income: number; gross: number; absent_deduct: number; other_deduct: number
  total_deduct: number; before_tax: number; markup: number; tax: number; net: number; diff: number
}

export function sumPayslipRows(rows: PayslipRow[]): PayslipTotals {
  const add = (k: keyof PayslipRow) => round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0))
  const before_tax = add('before_tax')
  const net = add('net')
  return {
    days: add('days'), ot_hours: add('ot_hours'), salary: add('salary'), ot_pay: add('ot_pay'),
    diligence: add('diligence'), other_income: add('other_income'), gross: add('gross'),
    absent_deduct: add('absent_deduct'), other_deduct: add('other_deduct'),
    total_deduct: add('total_deduct'), before_tax, markup: add('markup'), tax: add('tax'),
    net, diff: round2(net - before_tax),
  }
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** "กรกฎาคม 2568" จาก "2025-07" */
export function thaiMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

/** ช่วงวันที่ของรอบจ่าย: รอบ 1 = วันที่ 1-15, รอบ 2 = วันที่ 16 ถึงสิ้นเดือน */
export function periodRange(month: string, period: 1 | 2): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (period === 1) {
    return { start: `${month}-01`, end: `${month}-15`, label: 'รอบวันที่ 1 ถึง 15' }
  }
  return {
    start: `${month}-16`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
    label: `รอบวันที่ 16 ถึง ${lastDay}`,
  }
}

/** "22/07/2568" จาก "2025-07-22" */
export function thaiDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${Number(m[1]) + 543}`
}
