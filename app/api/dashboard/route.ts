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
    ] = await Promise.all([
      db.prepare('SELECT COUNT(*) as count FROM employees WHERE is_active = 1').first() as Promise<{ count: number }>,
      db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status != 'absent'").bind(today).first() as Promise<{ count: number }>,
      db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM sales WHERE date = ?').bind(today).first() as Promise<{ total: number }>,
      db.prepare("SELECT COUNT(*) as count FROM payroll WHERE status = 'pending'").first() as Promise<{ count: number }>,
      db.prepare(`
        SELECT a.*, e.name as employee_name, e.employee_type, sp.name as sales_point_name
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN sales_points sp ON a.sales_point_id = sp.id
        WHERE a.date = ?
        ORDER BY a.check_in DESC
        LIMIT 10
      `).bind(today).all(),
      db.prepare(`
        SELECT e.employee_type, COUNT(*) as count
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ? AND a.status != 'absent'
        GROUP BY e.employee_type
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
      total_employees: (totalEmployees as { count: number }).count,
      today_attendance: (todayAttendance as { count: number }).count,
      today_sales_total: (todaySales as { total: number }).total,
      pending_payroll: (pendingPayroll as { count: number }).count,
      recent_attendance: recentAttendance.results,
      attendance_by_type: attendanceByType.results,
      weekly_sales: weeklySales.results,
      today: today,
    })
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return Response.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
