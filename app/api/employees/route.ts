import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const active = searchParams.get('active')

    let query = 'SELECT * FROM employees WHERE 1=1'
    const params: string[] = []

    if (type) {
      query += ' AND employee_type = ?'
      params.push(type)
    }

    if (active !== null) {
      query += ' AND is_active = ?'
      params.push(active === 'true' ? '1' : '0')
    } else {
      query += ' AND is_active = 1'
    }

    query += ' ORDER BY name ASC'

    const result = await db.prepare(query).bind(...params).all()
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

    const body = await request.json() as {
      name: string
      employee_type: string
      sales_point_id?: string
      daily_rate?: number
      ot_rate?: number
      commission_rate?: number
      face_descriptor?: string
      qr_code?: string
      phone?: string
    }

    const {
      name,
      employee_type,
      sales_point_id,
      daily_rate = 350,
      ot_rate = 50,
      commission_rate = 0,
      face_descriptor,
      qr_code,
      phone,
    } = body

    if (!name || !employee_type) {
      return Response.json({ error: 'Name and employee_type are required' }, { status: 400 })
    }

    if (!['kitchen', 'sales'].includes(employee_type)) {
      return Response.json({ error: 'Invalid employee_type' }, { status: 400 })
    }

    const id = generateId()
    const generatedQR = qr_code || `EMP-${id.substring(0, 8).toUpperCase()}`

    await db.prepare(`
      INSERT INTO employees (id, name, employee_type, sales_point_id, daily_rate, ot_rate, commission_rate, face_descriptor, qr_code, phone, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      id, name, employee_type, sales_point_id || null, daily_rate, ot_rate, commission_rate,
      face_descriptor || null, generatedQR, phone || null
    ).run()

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first()
    return Response.json({ employee }, { status: 201 })
  } catch (error) {
    console.error('POST /api/employees error:', error)
    return Response.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}
