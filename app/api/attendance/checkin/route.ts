import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getTodayString, getBangkokDateTimeString, getBangkokMinutesOfDay } from '@/lib/utils'
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

    const today = getTodayString()

    // Approved offsite-work request for today overrides the normal location:
    // check-in is validated against the attached offsite coordinates instead.
    const offsite = await getApprovedOffsite(db, employee_id, today)

    // Branch used for both the location check and the default shift
    const targetPointId = sales_point_id || employee.sales_point_id || null

    // GPS validation — offsite location when approved; otherwise the selected
    // branch, falling back to the employee's primary branch, then head office.
    // Skipped only when the resolved place has no GPS configured.
    const geoTarget = offsite
      ? {
          label: `จุดปฏิบัติงานนอกสถานที่ (${offsite.location_name})`,
          latitude: offsite.latitude,
          longitude: offsite.longitude,
          radius: offsite.radius_meters || 300,
        }
      : await getGeoTarget(db, targetPointId)
    const geoError = validateGeoPosition(geoTarget, latitude, longitude)
    if (geoError) return Response.json(geoError, { status: 422 })
    const checkInTime = getBangkokDateTimeString()
    const nowMinutes = getBangkokMinutesOfDay()

    const existing = await db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employee_id, today).first() as any

    // Head office staff skip the daily time-approval step — record as approved
    const autoApprove = isOfficeEmployee(employee.job_title) ? 1 : 0
    if (autoApprove) await ensureAttendanceApprovedColumn(db)
    await ensureAttendanceStatusColumns(db)

    if (existing) {
      if (existing.check_in) {
        return Response.json({ error: 'เช็คอินไปแล้ววันนี้', check_in: existing.check_in }, { status: 409 })
      }
      await db.prepare('UPDATE attendance SET check_in=?, check_in_method=?, check_in_lat=?, check_in_lng=?, approved=MAX(COALESCE(approved,0), ?), offsite_request_id=COALESCE(?, offsite_request_id) WHERE id=?')
        .bind(checkInTime, method, latitude ?? null, longitude ?? null, autoApprove, offsite?.id ?? null, existing.id).run()
    } else {
      // Fall back to the branch's default shift when none was chosen
      let effectiveShiftId: string | null = shift_id || null
      if (!effectiveShiftId && targetPointId) {
        try {
          const branch = await db.prepare('SELECT default_shift_id FROM sales_points WHERE id = ?')
            .bind(targetPointId).first() as any
          if (branch?.default_shift_id) effectiveShiftId = branch.default_shift_id
        } catch {}
      }

      let status = 'present'
      if (effectiveShiftId) {
        const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').bind(effectiveShiftId).first() as any
        if (shift) {
          const [h, m] = shift.start_time.split(':').map(Number)
          if (nowMinutes > h * 60 + m + 15) status = 'late'
        }
      } else if (employee.work_start) {
        // No shift — fixed personal schedule (e.g. head office 08:00-18:00), 15-min grace
        const [h, m] = String(employee.work_start).split(':').map(Number)
        if (!Number.isNaN(h) && nowMinutes > h * 60 + (m || 0) + 15) status = 'late'
      }
      const id = generateId()
      await db.prepare(`
        INSERT INTO attendance (id, employee_id, date, shift_id, check_in, check_in_method, sales_point_id, status, check_in_lat, check_in_lng, approved, offsite_request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, employee_id, today, effectiveShiftId, checkInTime, method, sales_point_id || null, status, latitude ?? null, longitude ?? null, autoApprove, offsite?.id ?? null).run()
    }

    return Response.json({
      success: true,
      message: offsite
        ? `เช็คอินสำเร็จ (นอกสถานที่: ${offsite.location_name}): ${employee.name}`
        : `เช็คอินสำเร็จ: ${employee.name}`,
      employee_name: employee.name,
      employee_type: employee.employee_type,
      check_in: checkInTime,
      offsite: offsite ? { location_name: offsite.location_name } : null,
      // Diagnostics shown on the scan screen so a stale deployment is obvious
      server_version: APP_VERSION,
      server_utc: new Date().toISOString().slice(11, 19),
    })
  } catch (error) {
    console.error('POST /api/attendance/checkin error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
