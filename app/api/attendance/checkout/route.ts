import { getRequestContext } from '@cloudflare/next-on-pages'
import { getTodayString, calculateHoursWorked, calculateOTHours, getBangkokDateTimeString, getBangkokMinutesOfDay } from '@/lib/utils'
import { getGeoTarget, validateGeoPosition } from '@/lib/geo'
import { isOfficeEmployee } from '@/lib/auth-server'
import { ensureAttendanceApprovedColumn, ensureAttendanceStatusColumns, getApprovedOffsite } from '@/lib/db-tables'
import { APP_VERSION } from '@/lib/version'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      method: 'face' | 'qr' | 'manual'
      latitude?: number
      longitude?: number
    }

    const { employee_id, method = 'manual', latitude, longitude } = body

    if (!employee_id) {
      return Response.json({ error: 'employee_id is required' }, { status: 400 })
    }

    const employee = await db
      .prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id)
      .first() as { id: string; name: string; employee_type: string; sales_point_id: string | null; job_title: string | null } | null

    if (!employee) {
      return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })
    }

    const today = getTodayString()
    const existing = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employee_id, today)
      .first() as {
        id: string
        check_in: string | null
        check_out: string | null
        status: string
        sales_point_id: string | null
        shift_id: string | null
      } | null

    if (!existing) {
      return Response.json({ error: 'ยังไม่ได้เช็คอินวันนี้' }, { status: 400 })
    }

    if (!existing.check_in) {
      return Response.json({ error: 'ยังไม่ได้เช็คอิน' }, { status: 400 })
    }

    if (existing.check_out) {
      return Response.json({ error: 'เช็คเอาต์ไปแล้ววันนี้', check_out: existing.check_out }, { status: 409 })
    }

    // Approved offsite request for today overrides the normal location check
    const offsite = await getApprovedOffsite(db, employee_id, today)

    // GPS validation against the offsite location when approved; otherwise the
    // branch worked today, the employee's primary branch, or the head office.
    const geoTarget = offsite
      ? {
          label: `จุดปฏิบัติงานนอกสถานที่ (${offsite.location_name})`,
          latitude: offsite.latitude,
          longitude: offsite.longitude,
          radius: offsite.radius_meters || 300,
        }
      : await getGeoTarget(db, existing.sales_point_id || employee.sales_point_id || null)
    const geoError = validateGeoPosition(geoTarget, latitude, longitude)
    if (geoError) return Response.json(geoError, { status: 422 })

    const checkOutTime = getBangkokDateTimeString()
    const nowMinutes = getBangkokMinutesOfDay()

    const totalHours = calculateHoursWorked(existing.check_in, checkOutTime)
    const regularHours = Math.min(totalHours, 8)
    const otHours = calculateOTHours(totalHours)

    // ออกก่อนเวลา: checkout before the scheduled end time (shift end or the
    // employee's fixed work_end)
    let endTimeStr: string | null = null
    if (existing.shift_id) {
      const shift = await db.prepare('SELECT end_time FROM shifts WHERE id = ?')
        .bind(existing.shift_id).first() as any
      if (shift?.end_time) endTimeStr = shift.end_time
    }
    if (!endTimeStr && (employee as any).work_end) endTimeStr = String((employee as any).work_end)

    let earlyOut = 0
    if (endTimeStr) {
      const [eh, em] = endTimeStr.split(':').map(Number)
      if (!Number.isNaN(eh) && nowMinutes < eh * 60 + (em || 0)) {
        earlyOut = 1
      }
    }

    // Head office staff skip the daily time-approval step — record as approved
    const autoApprove = isOfficeEmployee(employee.job_title) ? 1 : 0
    if (autoApprove) await ensureAttendanceApprovedColumn(db)
    await ensureAttendanceStatusColumns(db)

    await db
      .prepare(`
        UPDATE attendance
        SET check_out = ?, check_out_method = ?, regular_hours = ?, ot_hours = ?, check_out_lat = ?, check_out_lng = ?,
            approved = MAX(COALESCE(approved, 0), ?), early_out = ?,
            offsite_request_id = COALESCE(?, offsite_request_id)
        WHERE id = ?
      `)
      .bind(checkOutTime, method, regularHours, otHours, latitude ?? null, longitude ?? null, autoApprove, earlyOut, offsite?.id ?? null, existing.id)
      .run()

    const updated = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(existing.id).first()

    return Response.json({
      success: true,
      early_out: earlyOut === 1,
      offsite: offsite ? { location_name: offsite.location_name } : null,
      message: earlyOut
        ? `เช็คเอาต์สำเร็จ (ออกก่อนเวลา ${endTimeStr}): ${employee.name}`
        : offsite
          ? `เช็คเอาต์สำเร็จ (นอกสถานที่: ${offsite.location_name}): ${employee.name}`
          : `เช็คเอาต์สำเร็จ: ${employee.name}`,
      employee_name: employee.name,
      employee_type: employee.employee_type,
      check_out: checkOutTime,
      // Diagnostics shown on the scan screen so a stale deployment is obvious
      server_version: APP_VERSION,
      server_utc: new Date().toISOString().slice(11, 19),
      total_hours: Math.round(totalHours * 100) / 100,
      regular_hours: Math.round(regularHours * 100) / 100,
      ot_hours: Math.round(otHours * 100) / 100,
      attendance: updated,
    })
  } catch (error) {
    console.error('POST /api/attendance/checkout error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
