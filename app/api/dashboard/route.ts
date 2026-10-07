import { getRequestContext } from '@cloudflare/next-on-pages'
import { getTodayString } from '@/lib/utils'
import { ensureAttendanceStatusColumns, ensureOffsiteRequestsTable, ensureEmployeeScheduleColumns } from '@/lib/db-tables'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// แผนกตามตำแหน่ง (job_title) — ตรงกับ departmentOfEmployee ใน lib/diligence.ts
//   sales   = หน้าร้าน
//   kitchen = ครัวกลาง
//   office  = สำนักงานใหญ่ (Head Office) และตำแหน่งอื่นนอกเหนือจากสองกลุ่มบน
const TITLE = "COALESCE(e.job_title, '')"
const DEPARTMENT_SQL: Record<string, string> = {
  sales: `(${TITLE} = 'sales' OR (${TITLE} = '' AND e.employee_type = 'sales'))`,
  kitchen: `(${TITLE} = 'kitchen' OR (${TITLE} = '' AND COALESCE(e.employee_type, '') != 'sales'))`,
  office: `(${TITLE} NOT IN ('', 'sales', 'kitchen'))`,
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const realToday = getTodayString()
    await ensureAttendanceStatusColumns(db)
    await ensureOffsiteRequestsTable(db)
    await ensureEmployeeScheduleColumns(db)

    // ย้อนดูวันที่อื่นได้ และกรองตามแผนก/สาขาได้
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date') || ''
    const today = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && dateParam <= realToday ? dateParam : realToday
    const department = searchParams.get('department') || 'all'
    const branch = searchParams.get('branch') || 'all'

    // เงื่อนไขกรองของตารางที่ join employees (e) และ attendance (a)
    const deptSql = DEPARTMENT_SQL[department] ? ` AND ${DEPARTMENT_SQL[department]}` : ''
    // สาขา = จุดที่สแกนเข้างานวันนั้น ('none' = ไม่ได้สแกนที่สาขาใด เช่น สำนักงานใหญ่)
    const branchAtt = branch === 'none' ? ' AND a.sales_point_id IS NULL'
      : branch !== 'all' ? ' AND a.sales_point_id = ?' : ''
    const branchArgs = branch !== 'all' && branch !== 'none' ? [branch] : []
    // นับพนักงานทั้งหมดตามสาขาประจำ
    const branchEmp = branch === 'none' ? ' AND e.sales_point_id IS NULL'
      : branch !== 'all' ? ' AND e.sales_point_id = ?' : ''

    const [
      totalEmployees,
      todayAttendance,
      todaySales,
      pendingPayroll,
      recentAttendance,
      attendanceByType,
      laborCostToday,
      costByPoint,
      attendanceByDept,
    ] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as count FROM employees e WHERE e.is_active = 1${deptSql}${branchEmp}`)
        .bind(...branchArgs).first(),
      // นับเป็นรายคน — คนที่ทำหลายรอบในวันเดียวนับครั้งเดียว
      db.prepare(`
        SELECT COUNT(DISTINCT a.employee_id) as count FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ? AND a.status != 'absent'${deptSql}${branchAtt}
      `).bind(today, ...branchArgs).first(),
      branch === 'none'
        ? db.prepare('SELECT 0 as total').first()
        : db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM sales WHERE date = ?${branch !== 'all' ? ' AND sales_point_id = ?' : ''}`)
            .bind(today, ...branchArgs).first(),
      db.prepare("SELECT COUNT(*) as count FROM payroll WHERE status = 'pending'").first(),

      // Extended: include shift info, employee code, primary branch
      db.prepare(`
        SELECT
          a.id, a.employee_id, a.date, a.check_in, a.check_out,
          a.status, a.regular_hours, a.ot_hours, a.notes, a.early_out,
          e.name        AS employee_name,
          e.employee_type,
          e.job_title,
          e.qr_code     AS employee_code,
          e.daily_rate,
          e.ot_rate,
          sp_today.name    AS sales_point_name,
          sp_primary.name  AS primary_point_name,
          sh.name          AS shift_name,
          sh.start_time    AS shift_start,
          sh.end_time      AS shift_end,
          o.location_name  AS offsite_location
        FROM attendance a
        LEFT JOIN employees   e          ON a.employee_id   = e.id
        LEFT JOIN sales_points sp_today  ON a.sales_point_id = sp_today.id
        LEFT JOIN sales_points sp_primary ON e.sales_point_id = sp_primary.id
        LEFT JOIN shifts       sh         ON a.shift_id       = sh.id
        LEFT JOIN offsite_requests o      ON a.offsite_request_id = o.id
        WHERE a.date = ?${deptSql}${branchAtt}
        ORDER BY a.check_in DESC
        LIMIT 200
      `).bind(today, ...branchArgs).all(),

      db.prepare(`
        SELECT e.employee_type, COUNT(*) as count
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ? AND a.status != 'absent'${deptSql}${branchAtt}
        GROUP BY e.employee_type
      `).bind(today, ...branchArgs).all(),

      // Today's total labor cost from actual daily_rate + ot
      db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN a.status != 'absent' THEN e.daily_rate ELSE 0 END +
          COALESCE(a.ot_hours, 0) * COALESCE(e.ot_rate, 0)
        ), 0) AS total_cost
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ?${deptSql}${branchAtt}
      `).bind(today, ...branchArgs).first(),

      // Labor cost grouped by sales_point for allocation chart
      db.prepare(`
        SELECT
          COALESCE(sp.name, CASE WHEN ${DEPARTMENT_SQL.office} THEN 'สำนักงานใหญ่ (Head Office)' ELSE 'ไม่ระบุสาขา' END) AS point_name,
          COALESCE(SUM(
            CASE WHEN a.status != 'absent' THEN e.daily_rate ELSE 0 END +
            COALESCE(a.ot_hours, 0) * COALESCE(e.ot_rate, 0)
          ), 0) AS cost,
          COUNT(CASE WHEN a.status != 'absent' THEN 1 END) AS headcount
        FROM attendance a
        LEFT JOIN employees    e  ON a.employee_id    = e.id
        LEFT JOIN sales_points sp ON a.sales_point_id = sp.id
        WHERE a.date = ?${deptSql}${branchAtt}
        GROUP BY a.sales_point_id, point_name
        ORDER BY cost DESC
      `).bind(today, ...branchArgs).all(),

      // คนมาทำงานแยกตามแผนก (นับรายคน)
      db.prepare(`
        SELECT
          CASE
            WHEN ${DEPARTMENT_SQL.office} THEN 'office'
            WHEN ${DEPARTMENT_SQL.sales} THEN 'sales'
            ELSE 'kitchen'
          END AS department,
          COUNT(DISTINCT a.employee_id) AS count
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date = ? AND a.status != 'absent'${deptSql}${branchAtt}
        GROUP BY department
      `).bind(today, ...branchArgs).all(),
    ])

    const weeklySales = await db.prepare(`
      SELECT date, COALESCE(SUM(amount), 0) as total
      FROM sales
      WHERE date >= date(?, '-6 days') AND date <= ?${branch !== 'all' && branch !== 'none' ? ' AND sales_point_id = ?' : ''}
      GROUP BY date
      ORDER BY date ASC
    `).bind(today, today, ...branchArgs).all()

    // Pending leave requests — table may not exist before /api/migrate runs
    let pendingLeaves = 0
    let pendingLeaveList: any[] = []
    try {
      const leaves = await db.prepare(`
        SELECT lr.id, lr.date_start, lr.date_end, lr.leave_type, e.name AS employee_name
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status = 'pending'
        ORDER BY lr.created_at DESC
        LIMIT 5
      `).all()
      pendingLeaveList = leaves.results || []
      const cnt = await db.prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE status = 'pending'").first() as any
      pendingLeaves = cnt?.count ?? 0
    } catch {}

    return Response.json({
      pending_leaves:   pendingLeaves,
      pending_leave_list: pendingLeaveList,
      total_employees:  (totalEmployees  as any).count,
      today_attendance: (todayAttendance as any).count,
      today_sales_total:(todaySales      as any).total,
      pending_payroll:  (pendingPayroll  as any).count,
      today_labor_cost: (laborCostToday  as any)?.total_cost ?? 0,
      recent_attendance: recentAttendance.results,
      attendance_by_type: attendanceByType.results,
      attendance_by_dept: attendanceByDept.results,
      cost_by_point:    costByPoint.results,
      weekly_sales:     weeklySales.results,
      today,
      real_today:       realToday,
      department,
      branch,
    })
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return Response.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
