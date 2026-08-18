import { getRequestContext } from '@cloudflare/next-on-pages'
import { ensureLeaveRequestsTable, ensureEmployeeScheduleColumns } from '@/lib/db-tables'
import { getTodayString } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// แผนก: office (สำนักงานใหญ่) / kitchen (ครัวกลาง) / sales (พนักงานขาย)
function departmentOf(emp: any): 'office' | 'kitchen' | 'sales' {
  const t = (emp.job_title || '').trim()
  if (t === 'sales' || (!t && emp.employee_type === 'sales')) return 'sales'
  if (t === 'kitchen' || !t) return 'kitchen'
  return 'office'
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureLeaveRequestsTable(db)
    await ensureEmployeeScheduleColumns(db)

    const { searchParams } = new URL(request.url)
    const today = getTodayString() // YYYY-MM-DD
    const month = searchParams.get('month') || today.slice(0, 7) // YYYY-MM
    const department = searchParams.get('department') || 'all'
    const employeeId = searchParams.get('employee_id') || ''

    const [yearNum, monthNum] = month.split('-').map(Number)
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return Response.json({ error: 'month ต้องอยู่ในรูปแบบ YYYY-MM' }, { status: 400 })
    }
    const daysInMonth = new Date(yearNum, monthNum, 0).getDate()
    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`

    const [employeesRes, attendanceRes, leavesRes] = await Promise.all([
      db.prepare('SELECT id, name, employee_type, job_title, work_days FROM employees WHERE is_active = 1 ORDER BY name').all(),
      db.prepare(`
        SELECT employee_id, date, status FROM attendance
        WHERE date >= ? AND date <= ?
      `).bind(monthStart, monthEnd).all(),
      db.prepare(`
        SELECT employee_id, date_start, date_end, leave_unit, hours FROM leave_requests
        WHERE status = 'approved'
          AND date_start <= ?
          AND MAX(COALESCE(NULLIF(date_end, ''), date_start), date_start) >= ?
      `).bind(monthEnd, monthStart).all(),
    ])

    const attendanceByEmp = new Map<string, Map<string, string>>()
    for (const a of (attendanceRes.results || []) as any[]) {
      if (!attendanceByEmp.has(a.employee_id)) attendanceByEmp.set(a.employee_id, new Map())
      attendanceByEmp.get(a.employee_id)!.set(a.date, a.status)
    }

    // Set of leave dates (clipped to month) per employee
    // Full-day leaves count as leave days; part-day leaves are tracked as hours
    // and never turn a day into a leave day.
    const leaveDatesByEmp = new Map<string, Set<string>>()
    const leaveHoursByEmp = new Map<string, number>()
    const partialDatesByEmp = new Map<string, Set<string>>()
    for (const l of (leavesRes.results || []) as any[]) {
      if (l.leave_unit === 'hour') {
        leaveHoursByEmp.set(l.employee_id, (leaveHoursByEmp.get(l.employee_id) || 0) + (l.hours || 0))
        const pset = partialDatesByEmp.get(l.employee_id) || new Set<string>()
        pset.add(l.date_start)
        partialDatesByEmp.set(l.employee_id, pset)
        continue
      }
      // A blank or reversed date_end would otherwise drop the leave entirely
      const rawEnd = l.date_end && l.date_end >= l.date_start ? l.date_end : l.date_start
      const start = l.date_start < monthStart ? monthStart : l.date_start
      const end = rawEnd > monthEnd ? monthEnd : rawEnd
      const set = leaveDatesByEmp.get(l.employee_id) || new Set<string>()
      const d = new Date(start + 'T00:00:00')
      const endD = new Date(end + 'T00:00:00')
      while (d <= endD) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        d.setDate(d.getDate() + 1)
      }
      leaveDatesByEmp.set(l.employee_id, set)
    }

    // Count missed workdays only up to today (not future days)
    const lastCountable = monthEnd < today ? monthEnd : (monthStart > today ? '' : today)

    const stats = []
    for (const emp of (employeesRes.results || []) as any[]) {
      const dept = departmentOf(emp)
      if (department !== 'all' && dept !== department) continue
      if (employeeId && emp.id !== employeeId) continue

      const attMap = attendanceByEmp.get(emp.id) || new Map()
      const leaveSet = leaveDatesByEmp.get(emp.id) || new Set<string>()
      const partialSet = partialDatesByEmp.get(emp.id) || new Set<string>()

      let present = 0, late = 0, absentRecorded = 0
      attMap.forEach((status: string) => {
        if (status === 'late') { late++; present++ }
        else if (status === 'absent') absentRecorded++
        else present++
      })

      // For employees with a fixed weekly schedule: count past workdays with
      // no attendance and no approved leave as absent.
      let absentMissing = 0
      const workDays: number[] = emp.work_days
        ? String(emp.work_days).split(',').map(Number).filter((n: number) => !Number.isNaN(n))
        : []
      if (workDays.length > 0 && lastCountable) {
        const lastDay = Number(lastCountable.slice(8, 10))
        for (let day = 1; day <= lastDay; day++) {
          const dateStr = `${month}-${String(day).padStart(2, '0')}`
          if (!workDays.includes(new Date(yearNum, monthNum - 1, day).getDay())) continue
          if (attMap.has(dateStr) || leaveSet.has(dateStr) || partialSet.has(dateStr)) continue
          absentMissing++
        }
      }

      stats.push({
        employee_id: emp.id,
        name: emp.name,
        department: dept,
        job_title: emp.job_title || emp.employee_type,
        present,
        late,
        leave: leaveSet.size,
        leave_hours: Math.round((leaveHoursByEmp.get(emp.id) || 0) * 100) / 100,
        absent: absentRecorded + absentMissing,
      })
    }

    return Response.json({ month, department, stats })
  } catch (error) {
    console.error('GET /api/reports/attendance-stats error:', error)
    return Response.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 })
  }
}
