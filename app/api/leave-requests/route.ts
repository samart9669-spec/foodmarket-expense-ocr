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

// Approve/reject via the static route (id in body) — avoids any environment
// issues with the dynamic [id] route.
export async function PATCH(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureLeaveRequestsTable(env.DB)
    const body = await request.json() as any
    const { id, status, admin_note } = body

    if (!id) {
      return Response.json({ error: 'ต้องระบุ id ของใบลา' }, { status: 400 })
    }
    if (!['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'status ต้องเป็น approved หรือ rejected' }, { status: 400 })
    }

    const existing = await env.DB.prepare('SELECT id FROM leave_requests WHERE id = ?').bind(id).first()
    if (!existing) {
      return Response.json({ error: 'ไม่พบใบลานี้ในระบบ' }, { status: 404 })
    }

    const now = new Date().toISOString()
    await env.DB.prepare(`
      UPDATE leave_requests SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?
    `).bind(status, admin_note || null, now, id).run()

    return Response.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/leave-requests error:', error)
    return Response.json({ error: `เกิดข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    await ensureLeaveRequestsTable(env.DB)
    const body = await request.json() as any
    const { employee_id, date_start, date_end, leave_type, reason } = body
    const leave_unit = body.leave_unit === 'hour' ? 'hour' : 'day'
    const start_time: string | undefined = body.start_time
    const end_time: string | undefined = body.end_time

    if (!employee_id || !date_start || !date_end || !leave_type) {
      return Response.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 })
    }

    // Part-day leave covers one date and needs a valid time range
    let hours: number | null = null
    if (leave_unit === 'hour') {
      if (!start_time || !end_time) {
        return Response.json({ error: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด' }, { status: 400 })
      }
      const [sh, sm] = start_time.split(':').map(Number)
      const [eh, em] = end_time.split(':').map(Number)
      if ([sh, sm, eh, em].some(Number.isNaN)) {
        return Response.json({ error: 'รูปแบบเวลาไม่ถูกต้อง' }, { status: 400 })
      }
      const minutes = (eh * 60 + em) - (sh * 60 + sm)
      if (minutes <= 0) {
        return Response.json({ error: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' }, { status: 400 })
      }
      hours = Math.round((minutes / 60) * 100) / 100
    }

    const employee = await env.DB.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id).first() as any
    if (!employee) return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })

    const id = generateId()
    await env.DB.prepare(`
      INSERT INTO leave_requests (id, employee_id, date_start, date_end, leave_type, reason, leave_unit, start_time, end_time, hours)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, employee_id, date_start,
      leave_unit === 'hour' ? date_start : date_end,
      leave_type, reason || null,
      leave_unit,
      leave_unit === 'hour' ? start_time : null,
      leave_unit === 'hour' ? end_time : null,
      hours,
    ).run()

    return Response.json({
      success: true,
      message: leave_unit === 'hour'
        ? `ส่งคำขอลา ${hours} ชั่วโมงสำเร็จ รอการอนุมัติจากผู้จัดการ`
        : 'ส่งคำขอลาสำเร็จ รอการอนุมัติจากผู้จัดการ',
      id,
    })
  } catch (error) {
    console.error('POST /api/leave-requests error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
