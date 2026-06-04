import { getRequestContext } from '@cloudflare/next-on-pages'
import { getTodayString } from '@/lib/utils'

export const runtime = 'edge'

export async function GET() {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const today = getTodayString()

    const [
      totalEmployees,
      todayAttendance,
      todaySales,
      pendingPayroll,
      recentAttendance,
      attendanceByType,
      laborCostToday,
      costByPoint,
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM employees WHERE is_active = 1').first(),
      db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status != 'absent'").bind(today).first(),
      db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM sales WHERE date = ?').bind(today).first(),
      db.prepare("SELECT COUNT(*) as count FROM payroll WHERE status = 'pending'").first(),

      // Extended: include shift info, employee code, primary branch
      db.prepare(`
        SELECT
          a.id, a.employee_id, a.date, a.check_in, a.check_out,
          a.status, a.regular_hours, a.ot_hours, a.notes,
          e.name        AS employee_name,
          e.employee_type,
          e.qr_code     AS employee_code,
          e.daily_rate,
          e.ot_rate,
          sp_today.name    AS sales_point_name,
          sp_primary.name  AS primary_point_name,
          sh.name          AS shift_name,
          sh.start_time    AS shift_start,
          sh.end_time      AS shift_end
        FROM attendance a
        LEFT JOIN employees   e          ON a.employee_id   = e.id
        LEFT JOIN sales_points sp_today  ON a.sales_point_id = sp_today.id
        LEFT JOIN sales_points sp_primary ON e.sales_point_id = sp_primary.id
        LEFT JOIN shifts       sh         ON a.shift_id       = sh.id
        WHERE a.date = ?
        ORDER BY a.check_in DESC
        LIMIT 20
      `).bind(today).all(),

      db.prepare(`
        SELECT e.employee_type, COUNT(*) as count
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ? AND a.status != 'absent'
        GROUP BY e.employee_type
      `).bind(today).all(),

      // Today's total labor cost from actual daily_rate + ot
      db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN a.status != 'absent' THEN e.daily_rate ELSE 0 END +
          COALESCE(a.ot_hours, 0) * COALESCE(e.ot_rate, 0)
        ), 0) AS total_cost
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ?
      `).bind(today).first(),

      // Labor cost grouped by sales_point for allocation chart
      db.prepare(`
        SELECT
          COALESCE(sp.name, 'ไม่ระบุสาขา') AS point_name,
          COALESCE(SUM(
            CASE WHEN a.status != 'absent' THEN e.daily_rate ELSE 0 END +
            COALESCE(a.ot_hours, 0) * COALESCE(e.ot_rate, 0)
          ), 0) AS cost,
          COUNT(CASE WHEN a.status != 'absent' THEN 1 END) AS headcount
        FROM attendance a
        LEFT JOIN employees    e  ON a.employee_id    = e.id
        LEFT JOIN sales_points sp ON a.sales_point_id = sp.id
        WHERE a.date = ?
        GROUP BY a.sales_point_id
        ORDER BY cost DESC
      `).bind(today).all(),
    ])

    const weeklySales = await db.prepare(`
      SELECT date, COALESCE(SUM(amount), 0) as total
      FROM sales
      WHERE date >= date(?, '-6 days') AND date <= ?
      GROUP BY date
      ORDER BY date ASC
    `).bind(today, today).all()

    return Response.json({
      total_employees:  (totalEmployees  as any).count,
      today_attendance: (todayAttendance as any).count,
      today_sales_total:(todaySales      as any).total,
      pending_payroll:  (pendingPayroll  as any).count,
      today_labor_cost: (laborCostToday  as any)?.total_cost ?? 0,
      recent_attendance: recentAttendance.results,
      attendance_by_type: attendanceByType.results,
      cost_by_point:    costByPoint.results,
      weekly_sales:     weeklySales.results,
      today,
    })
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return Response.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
