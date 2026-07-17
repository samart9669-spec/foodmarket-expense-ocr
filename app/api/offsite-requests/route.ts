import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { ensureOffsiteRequestsTable } from '@/lib/db-tables'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureOffsiteRequestsTable(env.DB)
    const { searchParams } = new URL(request.url)
    const employee_id = searchParams.get('employee_id')
    const status = searchParams.get('status')
    const date = searchParams.get('date')

    let sql = `
      SELECT o.*, e.name AS employee_name, e.employee_type, e.job_title
      FROM offsite_requests o
      JOIN employees e ON e.id = o.employee_id
      WHERE 1=1
    `
    const binds: string[] = []
    if (employee_id) { sql += ' AND o.employee_id = ?'; binds.push(employee_id) }
    if (status) { sql += ' AND o.status = ?'; binds.push(status) }
    if (date) { sql += ' AND o.date = ?'; binds.push(date) }
    sql += ' ORDER BY o.created_at DESC'

    const result = await (binds.length ? env.DB.prepare(sql).bind(...binds) : env.DB.prepare(sql)).all()
    return Response.json({ offsiteRequests: result.results })
  } catch (error) {
    console.error('GET /api/offsite-requests error:', error)
    return Response.json({ error: 'Failed to fetch offsite requests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureOffsiteRequestsTable(env.DB)
    const body = await request.json() as any
    const { employee_id, date, location_name, latitude, longitude, reason, radius_meters } = body

    if (!employee_id || !date || !location_name) {
      return Response.json({ error: 'กรุณากรอกข้อมูลให้ครบ (พนักงาน, วันที่, ชื่อสถานที่)' }, { status: 400 })
    }
    if (latitude == null || longitude == null) {
      return Response.json({ error: 'กรุณาแนบพิกัด GPS ของสถานที่ปฏิบัติงาน' }, { status: 400 })
    }

    const employee = await env.DB.prepare('SELECT id, name FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id).first() as any
    if (!employee) return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })

    const dup = await env.DB.prepare(
      "SELECT id FROM offsite_requests WHERE employee_id = ? AND date = ? AND status IN ('pending','approved')"
    ).bind(employee_id, date).first()
    if (dup) {
      return Response.json({ error: 'มีคำขอปฏิบัติงานนอกสถานที่ของวันนี้อยู่แล้ว' }, { status: 409 })
    }

    const id = generateId()
    await env.DB.prepare(`
      INSERT INTO offsite_requests (id, employee_id, date, location_name, latitude, longitude, radius_meters, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, employee_id, date, location_name, latitude, longitude, radius_meters || 300, reason || null).run()

    return Response.json({
      success: true,
      message: 'ส่งคำขอปฏิบัติงานนอกสถานที่สำเร็จ รอการอนุมัติ',
      id,
    })
  } catch (error) {
    console.error('POST /api/offsite-requests error:', error)
    return Response.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 })
  }
}

// Approve/reject — static route with id in body (same pattern as leave requests)
export async function PATCH(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureOffsiteRequestsTable(env.DB)
    const body = await request.json() as any
    const { id, status, admin_note } = body

    if (!id) return Response.json({ error: 'ต้องระบุ id ของคำขอ' }, { status: 400 })
    if (!['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'status ต้องเป็น approved หรือ rejected' }, { status: 400 })
    }

    const existing = await env.DB.prepare('SELECT id FROM offsite_requests WHERE id = ?').bind(id).first()
    if (!existing) return Response.json({ error: 'ไม่พบคำขอนี้ในระบบ' }, { status: 404 })

    const now = new Date().toISOString()
    await env.DB.prepare(
      'UPDATE offsite_requests SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?'
    ).bind(status, admin_note || null, now, id).run()

    return Response.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/offsite-requests error:', error)
    return Response.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 })
  }
}
