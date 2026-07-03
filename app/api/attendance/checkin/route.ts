import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getTodayString } from '@/lib/utils'
import { getGeoTarget, validateGeoPosition } from '@/lib/geo'
import { isOfficeEmployee } from '@/lib/auth-server'
import { ensureAttendanceApprovedColumn } from '@/lib/db-tables'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      method: 'face' | 'qr' | 'manual'
      sales_point_id?: string
      shift_id?: string
      latitude?: number
      longitude?: number
    }

    const { employee_id, method = 'manual', sales_point_id, shift_id, latitude, longitude } = body

    if (!employee_id) return Response.json({ error: 'employee_id is required' }, { status: 400 })

    const employee = await db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id).first() as any
    if (!employee) return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })

    // GPS validation — checked against the selected branch, falling back to the
    // employee's primary branch, and finally the head office for employees with
    // no branch (e.g. central kitchen). Skipped only when the resolved place has
    // no GPS configured.
    const targetPointId = sales_point_id || employee.sales_point_id || null
    const geoTarget = await getGeoTarget(db, targetPointId)
    const geoError = validateGeoPosition(geoTarget, latitude, longitude)
    if (geoError) return Response.json(geoError, { status: 422 })

    const today = getTodayString()
    const now = new Date()
    const checkInTime = `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    const existing = await db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employee_id, today).first() as any

    // Head office staff skip the daily time-approval step — record as approved
    const autoApprove = isOfficeEmployee(employee.job_title) ? 1 : 0
    if (autoApprove) await ensureAttendanceApprovedColumn(db)

    if (existing) {
      if (existing.check_in) {
        return Response.json({ error: 'เช็คอินไปแล้ววันนี้', check_in: existing.check_in }, { status: 409 })
      }
      await db.prepare('UPDATE attendance SET check_in=?, check_in_method=?, check_in_lat=?, check_in_lng=?, approved=MAX(COALESCE(approved,0), ?) WHERE id=?')
        .bind(checkInTime, method, latitude ?? null, longitude ?? null, autoApprove, existing.id).run()
    } else {
      let status = 'present'
      if (shift_id) {
        const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').bind(shift_id).first() as any
        if (shift) {
          const [h, m] = shift.start_time.split(':').map(Number)
          if (now.getHours() * 60 + now.getMinutes() > h * 60 + m + 15) status = 'late'
        }
      } else if (employee.work_start) {
        // No shift — fixed personal schedule (e.g. head office 08:00-18:00), 15-min grace
        const [h, m] = String(employee.work_start).split(':').map(Number)
        if (!Number.isNaN(h) && now.getHours() * 60 + now.getMinutes() > h * 60 + (m || 0) + 15) status = 'late'
      }
      const id = generateId()
      await db.prepare(`
        INSERT INTO attendance (id, employee_id, date, shift_id, check_in, check_in_method, sales_point_id, status, check_in_lat, check_in_lng, approved)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, employee_id, today, shift_id || null, checkInTime, method, sales_point_id || null, status, latitude ?? null, longitude ?? null, autoApprove).run()
    }

    return Response.json({
      success: true,
      message: `เช็คอินสำเร็จ: ${employee.name}`,
      employee_name: employee.name,
      employee_type: employee.employee_type,
      check_in: checkInTime,
    })
  } catch (error) {
    console.error('POST /api/attendance/checkin error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
