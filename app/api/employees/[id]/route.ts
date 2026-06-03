import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }
    return Response.json({ employee })
  } catch (error) {
    console.error('GET /api/employees/[id] error:', error)
    return Response.json({ error: 'Failed to fetch employee' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      name?: string
      employee_type?: string
      salary_type?: string
      sales_point_id?: string
      daily_rate?: number
      monthly_salary?: number
      ot_rate?: number
      commission_rate?: number
      face_descriptor?: string
      qr_code?: string
      phone?: string
      is_active?: number
    }

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { name, employee_type, salary_type, sales_point_id, daily_rate, monthly_salary, ot_rate, commission_rate, face_descriptor, qr_code, phone, is_active } = body

    await db.prepare(`
      UPDATE employees SET
        name = COALESCE(?, name),
        employee_type = COALESCE(?, employee_type),
        salary_type = COALESCE(?, salary_type),
        sales_point_id = COALESCE(?, sales_point_id),
        daily_rate = COALESCE(?, daily_rate),
        monthly_salary = COALESCE(?, monthly_salary),
        ot_rate = COALESCE(?, ot_rate),
        commission_rate = COALESCE(?, commission_rate),
        face_descriptor = COALESCE(?, face_descriptor),
        qr_code = COALESCE(?, qr_code),
        phone = COALESCE(?, phone),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      name ?? null, employee_type ?? null, salary_type ?? null, sales_point_id ?? null,
      daily_rate ?? null, monthly_salary ?? null, ot_rate ?? null, commission_rate ?? null,
      face_descriptor ?? null, qr_code ?? null, phone ?? null,
      is_active ?? null, params.id
    ).run()

    const updated = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first()
    return Response.json({ employee: updated })
  } catch (error) {
    console.error('PUT /api/employees/[id] error:', error)
    return Response.json({ error: 'Failed to update employee' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    await db.prepare('UPDATE employees SET is_active = 0 WHERE id = ?').bind(params.id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/employees/[id] error:', error)
    return Response.json({ error: 'Failed to delete employee' }, { status: 500 })
  }
}
