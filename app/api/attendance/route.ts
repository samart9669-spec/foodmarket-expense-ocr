import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getTodayString, roundOTToHalfHour, isOTEligible } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || getTodayString()
    const employee_id = searchParams.get('employee_id')
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')

    let query = `
      SELECT a.*, e.name as employee_name, e.employee_type, e.daily_rate, e.ot_rate,
             sp.name as sales_point_name
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      LEFT JOIN sales_points sp ON a.sales_point_id = sp.id
      WHERE 1=1
    `
    const params: string[] = []

    if (employee_id) {
      query += ' AND a.employee_id = ?'
      params.push(employee_id)
    }

    if (start_date && end_date) {
      query += ' AND a.date BETWEEN ? AND ?'
      params.push(start_date, end_date)
    } else if (date) {
      query += ' AND a.date = ?'
      params.push(date)
    }

    query += ' ORDER BY a.date DESC, e.name ASC'

    const result = await db.prepare(query).bind(...params).all()
    return Response.json({ attendance: result.results })
  } catch (error) {
    console.error('GET /api/attendance error:', error)
    return Response.json({ error: 'Failed to fetch attendance' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      date?: string
      shift_id?: string
      check_in?: string
      check_out?: string
      check_in_method?: string
      check_out_method?: string
      sales_point_id?: string
      regular_hours?: number
      ot_hours?: number
      status?: string
      notes?: string
    }

    const {
      employee_id,
      date = getTodayString(),
      shift_id,
      check_in,
      check_out,
      check_in_method = 'manual',
      check_out_method,
      sales_point_id,
      regular_hours = 0,
      ot_hours = 0,
      status = 'present',
      notes,
    } = body

    if (!employee_id) {
      return Response.json({ error: 'employee_id is required' }, { status: 400 })
    }

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(employee_id).first() as any
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    // OT is never stored per minute: daily-rate staff are paid in whole
    // 30-minute blocks, monthly staff earn none at all.
    const otStored = isOTEligible(employee.salary_type) ? roundOTToHalfHour(Number(ot_hours) || 0) : 0

    const existing = await db.prepare(
      'SELECT * FROM attendance WHERE employee_id = ? AND date = ?'
    ).bind(employee_id, date).first()

    if (existing) {
      return Response.json({ error: 'Attendance record already exists for this date', existing }, { status: 409 })
    }

    const id = generateId()

    await db.prepare(`
      INSERT INTO attendance (id, employee_id, date, shift_id, check_in, check_out, check_in_method, check_out_method, sales_point_id, regular_hours, ot_hours, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, employee_id, date, shift_id || null, check_in || null, check_out || null,
      check_in_method, check_out_method || null, sales_point_id || null,
      regular_hours, otStored, status, notes || null
    ).run()

    const attendance = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first()
    return Response.json({ attendance }, { status: 201 })
  } catch (error) {
    console.error('POST /api/attendance error:', error)
    return Response.json({ error: 'Failed to create attendance record' }, { status: 500 })
  }
}
