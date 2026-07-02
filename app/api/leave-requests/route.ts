import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { ensureLeaveRequestsTable } from '@/lib/db-tables'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureLeaveRequestsTable(env.DB)
    const { searchParams } = new URL(request.url)
    const employee_id = searchParams.get('employee_id')
    const status = searchParams.get('status') // pending|approved|rejected

    let sql = `
      SELECT lr.*, e.name as employee_name, e.employee_type
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      WHERE 1=1
    `
    const binds: string[] = []
    if (employee_id) { sql += ' AND lr.employee_id = ?'; binds.push(employee_id) }
    if (status) { sql += ' AND lr.status = ?'; binds.push(status) }
    sql += ' ORDER BY lr.created_at DESC'

    const result = await (binds.length
      ? env.DB.prepare(sql).bind(...binds)
      : env.DB.prepare(sql)
    ).all()

    return Response.json({ leaveRequests: result.results })
  } catch (error) {
    console.error('GET /api/leave-requests error:', error)
    return Response.json({ error: 'Failed to fetch leave requests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureLeaveRequestsTable(env.DB)
    const body = await request.json() as any
    const { employee_id, date_start, date_end, leave_type, reason } = body

    if (!employee_id || !date_start || !date_end || !leave_type) {
      return Response.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    const employee = await env.DB.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id).first() as any
    if (!employee) return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })

    const id = generateId()
    await env.DB.prepare(`
      INSERT INTO leave_requests (id, employee_id, date_start, date_end, leave_type, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, employee_id, date_start, date_end, leave_type, reason || null).run()

    return Response.json({
      success: true,
      message: 'ส่งคำขอลาสำเร็จ รอการอนุมัติจากผู้จัดการ',
      id,
    })
  } catch (error) {
    console.error('POST /api/leave-requests error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
