import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { getRoleFromRequest, isOfficeEmployee } from '@/lib/auth-server'
import { ensureEmployeeScheduleColumns } from '@/lib/db-tables'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const role = await getRoleFromRequest(request, db)
    if (role === 'viewer' || role === 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const active = searchParams.get('active')

    let query = 'SELECT * FROM employees WHERE 1=1'
    const params: string[] = []

    if (type) {
      query += ' AND employee_type = ?'
      params.push(type)
    }

    // manager cannot see office employees
    if (role === 'manager') {
      query += " AND (job_title IS NULL OR job_title = '' OR job_title IN ('kitchen', 'sales'))"
    }

    if (active !== null) {
      query += ' AND is_active = ?'
      params.push(active === 'true' ? '1' : '0')
    } else {
      query += ' AND is_active = 1'
    }

    query += ' ORDER BY name ASC'

    const result = params.length
      ? await db.prepare(query).bind(...params).all()
      : await db.prepare(query).all()
    return Response.json({ employees: result.results })
  } catch (error) {
    console.error('GET /api/employees error:', error)
    return Response.json({ error: 'Failed to fetch employees' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const role = await getRoleFromRequest(request, db)
    if (!role || role === 'viewer' || role === 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json() as {
      name: string
      job_title?: string
      salary_type?: string
      sales_point_id?: string
      daily_rate?: number
      monthly_salary?: number
      ot_rate?: number
      commission_rate?: number
      face_descriptor?: string
      face_photo?: string
      qr_code?: string
      phone?: string
      work_start?: string
      work_end?: string
      work_days?: string
    }

    const {
      name,
      job_title = '',
      salary_type = 'daily',
      sales_point_id,
      daily_rate = 350,
      monthly_salary = 0,
      ot_rate = 50,
      commission_rate = 0,
      face_descriptor,
      face_photo,
      qr_code,
      phone,
      work_start,
      work_end,
      work_days,
    } = body

    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 })
    }

    // manager cannot create office employees
    if (role === 'manager' && isOfficeEmployee(job_title)) {
      return Response.json({ error: 'Forbidden: cannot create office employees' }, { status: 403 })
    }

    const employee_type = job_title === 'sales' ? 'sales' : 'kitchen'

    const id = generateId()
    const generatedQR = qr_code || `EMP-${id.substring(0, 8).toUpperCase()}`

    await ensureEmployeeScheduleColumns(db)
    await db.prepare(`
      INSERT INTO employees (id, name, employee_type, job_title, salary_type, sales_point_id, daily_rate, monthly_salary, ot_rate, commission_rate, face_descriptor, face_photo, qr_code, phone, work_start, work_end, work_days, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, name, employee_type, job_title, salary_type, sales_point_id || null,
      daily_rate, monthly_salary, ot_rate, commission_rate,
      face_descriptor || null, face_photo || null, generatedQR, phone || null,
      work_start || null, work_end || null, work_days || null
    ).run()

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first()
    return Response.json({ employee }, { status: 201 })
  } catch (error) {
    console.error('POST /api/employees error:', error)
    return Response.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}
