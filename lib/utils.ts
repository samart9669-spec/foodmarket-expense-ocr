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

export function formatThaiTime(utcStr: string | null | undefined): string {
  if (!utcStr) return '-'
  // SQLite stores UTC without 'Z'; force UTC interpretation then convert to Bangkok
  const iso = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  return new Date(iso).toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatThaiDateTime(utcStr: string | null | undefined): string {
  if (!utcStr) return '-'
  const iso = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function getTodayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCurrentTimeString(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function calculateHoursWorked(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  const inTime = new Date(checkIn)
  const outTime = new Date(checkOut)
  return Math.max(0, (outTime.getTime() - inTime.getTime()) / 3600000)
}

export function calculateOTHours(totalHours: number, regularHours: number = 8): number {
  return Math.max(0, totalHours - regularHours)
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
  employee: { daily_rate: number; ot_rate: number; commission_rate: number },
  bonus: number = 0,
  deductions: number = 0
): PayrollCalculation {
  const days_worked = attendanceRecords.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'half').length
  const day_rate_total = attendanceRecords.reduce((sum, a) => {
    if (a.status === 'half') return sum + employee.daily_rate * 0.5
    if (a.status === 'present' || a.status === 'late') return sum + employee.daily_rate
    return sum
  }, 0)
  const ot_hours_total = attendanceRecords.reduce((sum, a) => sum + (a.ot_hours || 0), 0)
  const ot_total = ot_hours_total * employee.ot_rate
  const sales_total = salesRecords.reduce((sum, s) => sum + s.amount, 0)
  const commission_total = sales_total * ((employee.commission_rate || 0) / 100)
  const total_pay = day_rate_total + ot_total + commission_total + bonus - deductions
  return { days_worked, day_rate_total, ot_hours_total, ot_total, sales_total, commission_total, bonus, deductions, total_pay }
}

export function getEmployeeTypeLabel(type: string): string {
  return type === 'kitchen' ? 'ครัวกลาง' : 'พนักงานขาย'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = { present: 'มาทำงาน', absent: 'ขาดงาน', late: 'มาสาย', half: 'ครึ่งวัน' }
  return labels[status] || status
}

export function getPayrollStatusLabel(status: string): string {
  const labels: Record<string, string> = { pending: 'รอดำเนินการ', approved: 'อนุมัติแล้ว', paid: 'จ่ายแล้ว' }
  return labels[status] || status
}
