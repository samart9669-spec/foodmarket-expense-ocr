import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { ensurePayTermColumns } from '@/lib/db-tables'
import { payTermsOf, amountPerCycle } from '@/lib/pay-terms'
import { buildPayslipRow, sumPayslipRows, periodRange, thaiMonthLabel, type PayslipRow } from '@/lib/payslip'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// ข้อมูลสำหรับใบทำจ่ายและใบจ่ายเงินเดือน แยกตามสาขา
//
// ดึงรายการเงินเดือนที่คำนวณไว้แล้วในรอบที่เลือก แล้วจัดให้ตรงกับช่องในฟอร์ม

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'manager')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await ensurePayTermColumns(db)

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)
    const period = searchParams.get('period') === '2' ? 2 : 1
    const salesPointId = searchParams.get('sales_point_id') || ''

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: 'month ต้องอยู่ในรูปแบบ YYYY-MM' }, { status: 400 })
    }

    const { start, end, label } = periodRange(month, period as 1 | 2)

    // รายการเงินเดือนที่งวดอยู่ในช่วงรอบจ่ายที่เลือก
    const res = await db.prepare(`
      SELECT p.*, e.name AS employee_name, e.employee_type, e.daily_rate, e.ot_rate,
             e.job_title, e.salary_type, e.monthly_salary, e.pay_cycle,
             e.partner_name, e.partner_share, e.no_ot, e.no_diligence, e.incentive_eligible,
             e.sales_point_id, sp.name AS sales_point_name
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN sales_points sp ON sp.id = e.sales_point_id
      WHERE p.period_start >= ? AND p.period_end <= ?
      ORDER BY sp.name ASC, e.name ASC
    `).bind(start, end).all()

    let records = (res.results || []) as any[]
    if (salesPointId) records = records.filter(r => (r.sales_point_id || '') === salesPointId)

    // จัดกลุ่มตามสาขา — พนักงานที่ไม่ได้สังกัดสาขาไหนจะอยู่กลุ่ม "ไม่ระบุสาขา"
    const groups = new Map<string, { id: string; name: string; rows: PayslipRow[] }>()
    for (const r of records) {
      const key = r.sales_point_id || '__none__'
      if (!groups.has(key)) {
        groups.set(key, { id: key, name: r.sales_point_name || 'ไม่ระบุสาขา', rows: [] })
      }

      const terms = payTermsOf(r)
      // พนักงานรายเดือนที่มีคู่สัญญาร่วมจ่าย ให้หักส่วนของคู่สัญญาออก
      const partner_share = terms.salary_type === 'monthly'
        ? Math.min(Math.max(0, terms.partner_share), amountPerCycle(terms))
        : 0

      groups.get(key)!.rows.push(buildPayslipRow({
        employee_name: r.employee_name,
        employee_type: r.employee_type,
        daily_rate: r.daily_rate,
        ot_rate: r.ot_rate,
        days_worked: r.days_worked,
        ot_hours_total: r.ot_hours_total,
        day_rate_total: r.day_rate_total,
        ot_total: r.ot_total,
        diligence_allowance: r.diligence_allowance,
        diligence_deduction: r.diligence_deduction,
        incentive_total: r.incentive_total,
        commission_total: r.commission_total,
        bonus: r.bonus,
        deductions: r.deductions,
        partner_share,
        notes: r.notes,
      }))
    }

    const branches = Array.from(groups.values()).map(g => ({
      sales_point_id: g.id === '__none__' ? null : g.id,
      sales_point_name: g.name,
      rows: g.rows,
      totals: sumPayslipRows(g.rows),
    }))

    const pointsRes = await db.prepare('SELECT id, name FROM sales_points ORDER BY name').all()

    return Response.json({
      month,
      month_label: thaiMonthLabel(month),
      period,
      period_label: label,
      period_start: start,
      period_end: end,
      branches,
      all_branches: pointsRes.results || [],
      totals: sumPayslipRows(branches.flatMap(b => b.rows)),
    })
  } catch (error) {
    console.error('GET /api/payroll/payslip error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
