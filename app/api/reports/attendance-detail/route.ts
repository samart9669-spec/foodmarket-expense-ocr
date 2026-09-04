import { getRequestContext } from '@cloudflare/next-on-pages'
import { ensureLeaveRequestsTable, ensureEmployeeScheduleColumns, ensureAttendanceStatusColumns, ensureOffsiteRequestsTable } from '@/lib/db-tables'
import { getTodayString } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Per-day attendance detail for one employee in one month.
// day.kind: present | late | absent | leave | missing (past workday, no record)
//           | dayoff (not a scheduled workday) | future | none (no data)
export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureLeaveRequestsTable(db)
    await ensureEmployeeScheduleColumns(db)
    await ensureAttendanceStatusColumns(db)
    await ensureOffsiteRequestsTable(db)

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employee_id') || ''
    const today = getTodayString()
    const month = searchParams.get('month') || today.slice(0, 7)

    if (!employeeId) return Response.json({ error: 'ต้องระบุ employee_id' }, { status: 400 })
    const [yearNum, monthNum] = month.split('-').map(Number)
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return Response.json({ error: 'month ต้องอยู่ในรูปแบบ YYYY-MM' }, { status: 400 })
    }

    const employee = await db.prepare(
      'SELECT id, name, employee_type, job_title, work_start, work_end, work_days FROM employees WHERE id = ?'
    ).bind(employeeId).first() as any
    if (!employee) return Response.json({ error: 'ไม่พบพนักงาน' }, { status: 404 })

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate()
    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`

    const [attendanceRes, leavesRes] = await Promise.all([
      db.prepare(`
        SELECT a.date, a.status, a.check_in, a.check_out, a.ot_hours, a.early_out,
               COALESCE(a.session_no, 1) AS session_no,
               sp.name AS sales_point_name, o.location_name AS offsite_location
        FROM attendance a
        LEFT JOIN sales_points sp ON a.sales_point_id = sp.id
        LEFT JOIN offsite_requests o ON a.offsite_request_id = o.id
        WHERE a.employee_id = ? AND a.date >= ? AND a.date <= ?
        ORDER BY COALESCE(a.session_no, 1) ASC
      `).bind(employeeId, monthStart, monthEnd).all(),
      db.prepare(`
        SELECT date_start, date_end, leave_type, reason, leave_unit, start_time, end_time, hours FROM leave_requests
        WHERE employee_id = ? AND status = 'approved'
          AND date_start <= ?
          AND MAX(COALESCE(NULLIF(date_end, ''), date_start), date_start) >= ?
      `).bind(employeeId, monthEnd, monthStart).all(),
    ])

    // A day can hold more than one round (กะพิเศษ). The first round drives the
    // day's own times; extra rounds are listed alongside and add to the OT.
    // Hours worked are summed across every round of the day.
    const hoursBetween = (from: string | null, to: string | null): number | null => {
      if (!from || !to) return null
      const parse = (v: string) => {
        const m = v.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
        return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null
      }
      const a = parse(from), b = parse(to)
      if (a === null || b === null) return null
      return Math.max(0, (b - a) / 3600000)
    }

    const attMap = new Map<string, any>()
    const extraByDate = new Map<string, any[]>()
    for (const a of (attendanceRes.results || []) as any[]) {
      const first = attMap.get(a.date)
      if (!first) {
        attMap.set(a.date, {
          ...a,
          ot_hours_total: a.ot_hours || 0,
          hours_total: hoursBetween(a.check_in, a.check_out) ?? 0,
        })
        continue
      }
      first.ot_hours_total = (first.ot_hours_total || 0) + (a.ot_hours || 0)
      first.hours_total = (first.hours_total || 0) + (hoursBetween(a.check_in, a.check_out) ?? 0)
      // Any late round makes the day late
      if (a.status === 'late') first.status = 'late'
      ;(extraByDate.get(a.date) || extraByDate.set(a.date, []).get(a.date)!).push(a)
    }

    const leaveMap = new Map<string, { leave_type: string; reason: string | null; leave_unit?: string; start_time?: string; end_time?: string; hours?: number }>()
    for (const l of (leavesRes.results || []) as any[]) {
      // A blank or reversed date_end would otherwise drop the leave entirely
      const rawEnd = l.date_end && l.date_end >= l.date_start ? l.date_end : l.date_start
      const start = l.date_start < monthStart ? monthStart : l.date_start
      const end = rawEnd > monthEnd ? monthEnd : rawEnd
      const d = new Date(start + 'T00:00:00')
      const endD = new Date(end + 'T00:00:00')
      while (d <= endD) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        leaveMap.set(key, {
          leave_type: l.leave_type, reason: l.reason,
          leave_unit: l.leave_unit || 'day', start_time: l.start_time, end_time: l.end_time, hours: l.hours,
        })
        d.setDate(d.getDate() + 1)
      }
    }

    const workDays: number[] = employee.work_days
      ? String(employee.work_days).split(',').map(Number).filter((n: number) => !Number.isNaN(n))
      : []

    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`
      const dow = new Date(yearNum, monthNum - 1, day).getDay()
      const att = attMap.get(dateStr)
      const leave = leaveMap.get(dateStr)

      const partialLeave = leave?.leave_unit === 'hour'
      let kind: string
      if (att && att.status === 'absent') kind = 'absent'
      else if (att && att.status === 'late') kind = 'late'
      else if (att) kind = 'present'
      else if (leave && !partialLeave) kind = 'leave'
      else if (partialLeave) kind = 'leave_hours'
      else if (workDays.length > 0 && !workDays.includes(dow)) kind = 'dayoff'
      else if (dateStr > today) kind = 'future'
      else if (workDays.length > 0) kind = 'missing'
      else kind = 'none'

      days.push({
        date: dateStr,
        day_of_week: dow,
        kind,
        check_in: att?.check_in ?? null,
        check_out: att?.check_out ?? null,
        ot_hours: att ? (att.ot_hours_total ?? att.ot_hours ?? null) : null,
        hours: att ? Math.round((att.hours_total ?? 0) * 100) / 100 : null,
        extra_rounds: (extraByDate.get(dateStr) || []).map((r: any) => ({
          session_no: r.session_no,
          check_in: r.check_in,
          check_out: r.check_out,
          ot_hours: r.ot_hours,
        })),
        early_out: att?.early_out === 1,
        offsite_location: att?.offsite_location ?? null,
        sales_point_name: att?.sales_point_name ?? null,
        leave_type: leave?.leave_type ?? null,
        leave_reason: leave?.reason ?? null,
        leave_unit: leave?.leave_unit ?? null,
        leave_start_time: leave?.start_time ?? null,
        leave_end_time: leave?.end_time ?? null,
        leave_hours: leave?.hours ?? null,
      })
    }

    const summary = {
      present: days.filter(d => d.kind === 'present' || d.kind === 'late').length,
      late: days.filter(d => d.kind === 'late').length,
      leave: days.filter(d => d.kind === 'leave').length,
      leave_hours: Math.round(days.reduce((sum, d) => sum + (d.leave_unit === 'hour' ? (d.leave_hours || 0) : 0), 0) * 100) / 100,
      absent: days.filter(d => d.kind === 'absent' || d.kind === 'missing').length,
      hours_total: Math.round(days.reduce((sum, d) => sum + (d.hours || 0), 0) * 100) / 100,
      ot_total: Math.round(days.reduce((sum, d) => sum + (d.ot_hours || 0), 0) * 100) / 100,
    }

    return Response.json({
      month,
      employee: {
        id: employee.id,
        name: employee.name,
        job_title: employee.job_title || employee.employee_type,
        work_start: employee.work_start,
        work_end: employee.work_end,
        work_days: workDays,
      },
      summary,
      days,
    })
  } catch (error) {
    console.error('GET /api/reports/attendance-detail error:', error)
    return Response.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 })
  }
}
