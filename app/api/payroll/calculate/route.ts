import { getRequestContext } from '@cloudflare/next-on-pages'
import { calculatePayroll } from '@/lib/utils'
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
      id: string; name: string; employee_type: string; salary_type: string | null;
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
      regular_hours: number; ot_hours: number; status: string
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

    return Response.json({
      employee: { id: employee.id, name: employee.name, employee_type: employee.employee_type,
        salary_type: employee.salary_type || 'daily',
        daily_rate: employee.daily_rate, ot_rate: employee.ot_rate, commission_rate: employee.commission_rate },
      period_start, period_end,
      attendance_count: attendanceRecords.length,
      attendance_records: attendanceRecords,
      sales_records: salesRecords,
      calculation,
    })
  } catch (error) {
    console.error('POST /api/payroll/calculate error:', error)
    return Response.json({ error: 'Failed to calculate payroll' }, { status: 500 })
  }
}
