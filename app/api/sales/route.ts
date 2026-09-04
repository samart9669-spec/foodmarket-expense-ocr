import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getTodayString, getBangkokDateTimeString } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || getTodayString()
    const employee_id = searchParams.get('employee_id')
    const sales_point_id = searchParams.get('sales_point_id')
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')

    let query = `
      SELECT s.*, e.name as employee_name, e.employee_type, sp.name as sales_point_name
      FROM sales s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN sales_points sp ON s.sales_point_id = sp.id
      WHERE 1=1
    `
    const params: string[] = []

    if (employee_id) { query += ' AND s.employee_id = ?'; params.push(employee_id) }
    if (sales_point_id) { query += ' AND s.sales_point_id = ?'; params.push(sales_point_id) }

    if (start_date && end_date) {
      query += ' AND s.date BETWEEN ? AND ?'
      params.push(start_date, end_date)
    } else {
      query += ' AND s.date = ?'
      params.push(date)
    }

    query += ' ORDER BY s.created_at DESC'

    const result = await db.prepare(query).bind(...params).all()
    return Response.json({ sales: result.results })
  } catch (error) {
    console.error('GET /api/sales error:', error)
    return Response.json({ error: 'Failed to fetch sales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id?: string | null
      sales_point_id: string
      amount: number
      date?: string
      notes?: string
    }

    const { sales_point_id, amount, date = getTodayString(), notes } = body
    // ยอดขายเป็นของสาขาต่อวัน ระบุพนักงานเฉพาะเมื่อต้องการคิดค่าคอมรายบุคคล
    const employee_id = body.employee_id || null

    if (!sales_point_id || amount === undefined) {
      return Response.json({ error: 'sales_point_id and amount are required' }, { status: 400 })
    }
    if (amount < 0) {
      return Response.json({ error: 'Amount must be non-negative' }, { status: 400 })
    }

    if (employee_id) {
      const employee = await db.prepare('SELECT id FROM employees WHERE id = ?').bind(employee_id).first()
      if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 })
    }

    const salesPoint = await db.prepare('SELECT id FROM sales_points WHERE id = ?').bind(sales_point_id).first()
    if (!salesPoint) return Response.json({ error: 'Sales point not found' }, { status: 404 })

    const id = generateId()
    await db.prepare(
      'INSERT INTO sales (id, employee_id, sales_point_id, date, amount, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, employee_id, sales_point_id, date, amount, notes || null, getBangkokDateTimeString()).run()

    const sale = await db.prepare(`
      SELECT s.*, e.name as employee_name, sp.name as sales_point_name
      FROM sales s LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN sales_points sp ON s.sales_point_id = sp.id WHERE s.id = ?
    `).bind(id).first()

    return Response.json({ sale }, { status: 201 })
  } catch (error) {
    console.error('POST /api/sales error:', error)
    return Response.json({ error: 'Failed to create sale record' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })
    const sale = await db.prepare('SELECT id FROM sales WHERE id = ?').bind(id).first()
    if (!sale) return Response.json({ error: 'Sale not found' }, { status: 404 })
    await db.prepare('DELETE FROM sales WHERE id = ?').bind(id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/sales error:', error)
    return Response.json({ error: 'Failed to delete sale' }, { status: 500 })
  }
}
