import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const { searchParams } = new URL(request.url)
    const employee_id = searchParams.get('employee_id')
    const status = searchParams.get('status')

    let query = `
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE 1=1
    `
    const params: string[] = []
    if (employee_id) { query += ' AND p.employee_id = ?'; params.push(employee_id) }
    if (status) { query += ' AND p.status = ?'; params.push(status) }
    query += ' ORDER BY p.created_at DESC'

    const result = await db.prepare(query).bind(...params).all()
    return Response.json({ payroll: result.results })
  } catch (error) {
    console.error('GET /api/payroll error:', error)
    return Response.json({ error: 'Failed to fetch payroll' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string; period_start: string; period_end: string;
      days_worked?: number; day_rate_total?: number; ot_hours_total?: number;
      ot_total?: number; sales_total?: number; commission_total?: number;
      bonus?: number; deductions?: number; total_pay?: number; status?: string; notes?: string
    }

    const { employee_id, period_start, period_end, days_worked = 0, day_rate_total = 0,
      ot_hours_total = 0, ot_total = 0, sales_total = 0, commission_total = 0,
      bonus = 0, deductions = 0, total_pay = 0, status = 'pending', notes } = body

    if (!employee_id || !period_start || !period_end) {
      return Response.json({ error: 'employee_id, period_start, and period_end are required' }, { status: 400 })
    }

    const employee = await db.prepare('SELECT id FROM employees WHERE id = ?').bind(employee_id).first()
    if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 })

    const id = generateId()
    await db.prepare(`
      INSERT INTO payroll (id, employee_id, period_start, period_end, days_worked,
        day_rate_total, ot_hours_total, ot_total, sales_total, commission_total,
        bonus, deductions, total_pay, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, employee_id, period_start, period_end, days_worked, day_rate_total,
      ot_hours_total, ot_total, sales_total, commission_total,
      bonus, deductions, total_pay, status, notes || null).run()

    const payroll = await db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.id = ?
    `).bind(id).first()

    return Response.json({ payroll }, { status: 201 })
  } catch (error) {
    console.error('POST /api/payroll error:', error)
    return Response.json({ error: 'Failed to create payroll record' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const body = await request.json() as { id: string; status?: string; bonus?: number; deductions?: number; notes?: string }
    const { id, status, bonus, deductions, notes } = body

    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const existing = await db.prepare('SELECT id FROM payroll WHERE id = ?').bind(id).first()
    if (!existing) return Response.json({ error: 'Payroll record not found' }, { status: 404 })

    await db.prepare(`
      UPDATE payroll SET
        status = COALESCE(?, status), bonus = COALESCE(?, bonus),
        deductions = COALESCE(?, deductions), notes = COALESCE(?, notes)
      WHERE id = ?
    `).bind(status ?? null, bonus ?? null, deductions ?? null, notes ?? null, id).run()

    const updated = await db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.id = ?
    `).bind(id).first()

    return Response.json({ payroll: updated })
  } catch (error) {
    console.error('PATCH /api/payroll error:', error)
    return Response.json({ error: 'Failed to update payroll record' }, { status: 500 })
  }
}
