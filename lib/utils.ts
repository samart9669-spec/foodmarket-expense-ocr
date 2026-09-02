import { v4 as uuidv4 } from 'uuid'

export function generateId(): string {
  return uuidv4()
}

export function formatCurrency(amount: number): string {
  return `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// All attendance timestamps are stored as Bangkok wall-clock strings
// ("YYYY-MM-DD HH:MM:SS"). The server may run in UTC (Cloudflare), so
// "now" is always derived from the epoch shifted to UTC+7 and read via
// getUTC* — correct regardless of the server's own timezone.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

function bangkokNow(): Date {
  return new Date(Date.now() + BANGKOK_OFFSET_MS)
}

// Values are already Bangkok wall-clock — display them as stored, no conversion
export function formatThaiTime(str: string | null | undefined): string {
  if (!str) return '-'
  const m = str.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '-'
}

export function formatThaiDateTime(str: string | null | undefined): string {
  if (!str) return '-'
  const [datePart] = str.replace('T', ' ').split(' ')
  const m = str.match(/(\d{2}):(\d{2})/)
  const d = new Date(datePart + 'T00:00:00')
  const dateFmt = Number.isNaN(d.getTime())
    ? datePart
    : d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return m ? `${dateFmt} ${m[1]}:${m[2]}` : dateFmt
}

export function getTodayString(): string {
  const now = bangkokNow()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentTimeString(): string {
  const now = bangkokNow()
  const hours = String(now.getUTCHours()).padStart(2, '0')
  const minutes = String(now.getUTCMinutes()).padStart(2, '0')
  const seconds = String(now.getUTCSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function getBangkokDateTimeString(): string {
  return `${getTodayString()} ${getCurrentTimeString()}`
}

// Minutes since midnight, Bangkok time — for comparing against shift times
export function getBangkokMinutesOfDay(): number {
  const now = bangkokNow()
  return now.getUTCHours() * 60 + now.getUTCMinutes()
}

/**
 * Minutes between a scheduled time and the actual one, both "HH:MM".
 * Negative means early. The result is normalised to ±12 hours so an early
 * check-in reads as a small negative rather than wrapping to nearly a full
 * day, while a check-in past midnight on a night shift still reads as late.
 */
export function minutesFromScheduled(scheduled: string, actual: string): number {
  if (!scheduled || !actual) return 0
  // Accepts "HH:MM", "HH:MM:SS" or a full "YYYY-MM-DD HH:MM:SS" timestamp
  const a = scheduled.match(/(\d{1,2}):(\d{2})/)
  const b = actual.match(/(\d{1,2}):(\d{2})/)
  if (!a || !b) return 0
  const [sh, sm] = [Number(a[1]), Number(a[2])]
  const [ah, am] = [Number(b[1]), Number(b[2])]
  let diff = (ah * 60 + am) - (sh * 60 + sm)
  if (diff > 720) diff -= 1440
  if (diff < -720) diff += 1440
  return diff
}

/** Minutes late (0 when on time or early), given the department's grace. */
export function lateMinutes(scheduledStart: string, actualCheckIn: string, graceMinutes = 0): number {
  const diff = minutesFromScheduled(scheduledStart, actualCheckIn)
  return diff > graceMinutes ? diff : 0
}

export function calculateHoursWorked(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const inTime = new Date(checkIn)
  const outTime = new Date(checkOut)
  return Math.max(0, (outTime.getTime() - inTime.getTime()) / 3600000)
}

/**
 * OT is paid in whole 30-minute blocks: anything short of half an hour is not
 * paid, and a part-block is rounded down (1h20m OT pays 1h, not 1h20m).
 */
export function roundOTToHalfHour(hours: number): number {
  if (!hours || hours <= 0) return 0
  return Math.floor(hours * 2) / 2
}

/** OT applies to daily-rate staff only — monthly salaries already cover it. */
export function isOTEligible(salaryType: string | null | undefined): boolean {
  return (salaryType || 'daily') !== 'monthly'
}

export function calculateOTHours(totalHours: number, regularHours: number = 8): number {
  return roundOTToHalfHour(Math.max(0, totalHours - regularHours))
}

export interface PayrollCalculation {
  days_worked: number
  day_rate_total: number
  ot_hours_total: number
  ot_total: number
  sales_total: number
  commission_total: number
  bonus: number
  deductions: number
  total_pay: number
}

export function calculatePayroll(
  attendanceRecords: Array<{ regular_hours: number; ot_hours: number; status: string }>,
  salesRecords: Array<{ amount: number }>,
  employee: { daily_rate: number; ot_rate: number; commission_rate: number; salary_type?: string },
  bonus: number = 0,
  deductions: number = 0
): PayrollCalculation {
  const days_worked = attendanceRecords.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'half').length
  const day_rate_total = attendanceRecords.reduce((sum, a) => {
    if (a.status === 'half') return sum + employee.daily_rate * 0.5
    if (a.status === 'present' || a.status === 'late') return sum + employee.daily_rate
    return sum
  }, 0)
  // Monthly staff earn no OT; daily staff are paid in 30-minute blocks
  const ot_hours_total = isOTEligible(employee.salary_type)
    ? roundOTToHalfHour(attendanceRecords.reduce((sum, a) => sum + (a.ot_hours || 0), 0))
    : 0
  const ot_total = ot_hours_total * employee.ot_rate
  const sales_total = salesRecords.reduce((sum, s) => sum + s.amount, 0)
  const commission_total = sales_total * ((employee.commission_rate || 0) / 100)
  const total_pay = day_rate_total + ot_total + commission_total + bonus - deductions
  return { days_worked, day_rate_total, ot_hours_total, ot_total, sales_total, commission_total, bonus, deductions, total_pay }
}

export function getEmployeeTypeLabel(type: string): string {
  return type === 'kitchen' ? 'ครัวกลาง' : 'พนักงานขาย'
}

export function getSalaryTypeLabel(salaryType: string): string {
  return salaryType === 'monthly' ? 'รายเดือน' : 'รายวัน'
}

export function getAdminRole(): string {
  try {
    const auth = JSON.parse(sessionStorage.getItem('adminAuth') || '{}')
    return auth.role || ''
  } catch {
    return ''
  }
}

export function getAuthHeaders(): Record<string, string> {
  try {
    const auth = JSON.parse(sessionStorage.getItem('adminAuth') || '{}')
    return auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {}
  } catch {
    return {}
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = { present: 'มาทำงาน', absent: 'ขาดงาน', late: 'มาสาย', half: 'ครึ่งวัน' }
  return labels[status] || status
}

export function getPayrollStatusLabel(status: string): string {
  const labels: Record<string, string> = { pending: 'รอดำเนินการ', approved: 'อนุมัติแล้ว', paid: 'จ่ายแล้ว' }
  return labels[status] || status
}
