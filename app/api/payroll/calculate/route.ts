import { getRequestContext } from '@cloudflare/next-on-pages'
import { calculatePayroll } from '@/lib/utils'
import { diligenceTermsFor, diligenceForPeriod, DEPARTMENT_LABELS } from '@/lib/diligence'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      period_start: string
      period_end: string
      bonus?: number
      deductions?: number
    }

    const { employee_id, period_start, period_end, bonus = 0, deductions = 0 } = body

    if (!employee_id || !period_start || !period_end) {
      return Response.json({ error: 'employee_id, period_start, and period_end are required' }, { status: 400 })
    }

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(employee_id).first() as {
      id: string; name: string; employee_type: string; salary_type: string | null; job_title: string | null;
      sales_point_id: string | null;
      daily_rate: number; ot_rate: number; commission_rate: number
    } | null

    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    const attendanceResult = await db.prepare(
      'SELECT * FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC'
    ).bind(employee_id, period_start, period_end).all()

    const attendanceRecords = attendanceResult.results as Array<{
      id: string; date: string; check_in: string | null; check_out: string | null;
      regular_hours: number; ot_hours: number; status: string; sales_point_id: string | null
    }>

    const salesResult = await db.prepare(
      'SELECT * FROM sales WHERE employee_id = ? AND date BETWEEN ? AND ?'
    ).bind(employee_id, period_start, period_end).all()

    const salesRecords = salesResult.results as Array<{ amount: number }>

    const calculation = calculatePayroll(
      attendanceRecords,
      salesRecords,
      { ...employee, salary_type: employee.salary_type || 'daily' },
      bonus,
      deductions,
    )

    // ── Settings ──────────────────────────────────────────────────
    const settingsRes = await db.prepare('SELECT key, value FROM payroll_settings').all()
    const settings: Record<string, string> = {}
    for (const row of (settingsRes.results || []) as any[]) settings[row.key] = row.value

    // ── เบี้ยขยัน: pay and deduct terms differ per department; office has none ──
    const terms = diligenceTermsFor(employee, settings)
    const late_days = attendanceRecords.filter(a => a.status === 'late').length
    const { allowance: diligence_allowance, deduction: diligence_deduction } =
      diligenceForPeriod(terms, late_days)

    // ── Incentive from the sales of the branches worked in the period ──
    // Each branch pays its own rate on the sales it took that period.
    const branchIds = new Set<string>()
    for (const a of attendanceRecords) if (a.sales_point_id) branchIds.add(a.sales_point_id)
    if (branchIds.size === 0 && employee.sales_point_id) branchIds.add(employee.sales_point_id)

    let incentive_total = 0
    const incentive_breakdown: Array<{ sales_point_id: string; name: string; sales: number; rate: number; amount: number }> = []
    for (const spId of Array.from(branchIds)) {
      const branch = await db.prepare('SELECT id, name, incentive_rate FROM sales_points WHERE id = ?')
        .bind(spId).first() as any
      const rate = parseFloat(branch?.incentive_rate ?? 0) || 0
      if (!branch || rate <= 0) continue
      const branchSales = await db.prepare(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM sales WHERE sales_point_id = ? AND date BETWEEN ? AND ?'
      ).bind(spId, period_start, period_end).first() as any
      const sales = branchSales?.total || 0
      const amount = Math.round(sales * (rate / 100) * 100) / 100
      if (amount === 0) continue
      incentive_total += amount
      incentive_breakdown.push({ sales_point_id: spId, name: branch.name, sales, rate, amount })
    }
    incentive_total = Math.round(incentive_total * 100) / 100

    const total_pay = Math.round(
      (calculation.total_pay + incentive_total + diligence_allowance - diligence_deduction) * 100
    ) / 100

    return Response.json({
      employee: { id: employee.id, name: employee.name, employee_type: employee.employee_type,
        salary_type: employee.salary_type || 'daily',
        daily_rate: employee.daily_rate, ot_rate: employee.ot_rate, commission_rate: employee.commission_rate },
      period_start, period_end,
      attendance_count: attendanceRecords.length,
      attendance_records: attendanceRecords,
      sales_records: salesRecords,
      diligence: {
        department: terms.department,
        department_label: DEPARTMENT_LABELS[terms.department],
        eligible: terms.eligible,
        grace_minutes: terms.grace_minutes,
        amount: terms.amount,
        deduction_amount: terms.deduction,
        mode: terms.mode,
      },
      incentive_breakdown,
      calculation: {
        ...calculation,
        incentive_total, late_days,
        diligence_allowance, diligence_deduction,
        total_pay,
      },
    })
  } catch (error) {
    console.error('POST /api/payroll/calculate error:', error)
    return Response.json({ error: 'Failed to calculate payroll' }, { status: 500 })
  }
}
