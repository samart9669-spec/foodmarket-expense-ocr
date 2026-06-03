import { getRequestContext } from '@cloudflare/next-on-pages'
import { getRoleFromRequest, isOfficeEmployee } from '@/lib/auth-server'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const role = await getRoleFromRequest(request, db)
    if (role === 'viewer' || role === 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first<any>()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (role === 'manager' && isOfficeEmployee(employee.job_title)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
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

    const role = await getRoleFromRequest(request, db)
    if (!role || role === 'viewer' || role === 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json() as {
      name?: string
      job_title?: string
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

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first<any>()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    // manager cannot edit office employees
    if (role === 'manager' && isOfficeEmployee(employee.job_title)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    // manager cannot promote a non-office employee to office
    if (role === 'manager' && body.job_title !== undefined && isOfficeEmployee(body.job_title)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, job_title, salary_type, sales_point_id, daily_rate, monthly_salary, ot_rate, commission_rate, face_descriptor, qr_code, phone, is_active } = body

    const employee_type = job_title !== undefined ? (job_title === 'sales' ? 'sales' : 'kitchen') : undefined

    await db.prepare(`
      UPDATE employees SET
        name = COALESCE(?, name),
        employee_type = COALESCE(?, employee_type),
        job_title = COALESCE(?, job_title),
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
      name ?? null, employee_type ?? null, job_title ?? null, salary_type ?? null, sales_point_id ?? null,
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

    const role = await getRoleFromRequest(request, db)
    if (!role || role === 'viewer' || role === 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(params.id).first<any>()
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (role === 'manager' && isOfficeEmployee(employee.job_title)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.prepare('UPDATE employees SET is_active = 0 WHERE id = ?').bind(params.id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/employees/[id] error:', error)
    return Response.json({ error: 'Failed to delete employee' }, { status: 500 })
  }
}
