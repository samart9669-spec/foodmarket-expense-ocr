import { getRequestContext } from '@cloudflare/next-on-pages'
import { getTodayString, calculateHoursWorked, getBangkokDateTimeString, getCurrentTimeString, minutesFromScheduled, isOTEligible, scheduledWorkHours, overtimeHours, roundOTToHalfHour } from '@/lib/utils'
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
      .first() as { id: string; name: string; employee_type: string; sales_point_id: string | null; job_title: string | null; salary_type: string | null } | null

    if (!employee) {
      return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })
    }

    const today = getTodayString()
    await ensureAttendanceStatusColumns(db)

    // Close the round that is still open — with a กะพิเศษ there can be more
    // than one round on the same day, so the latest open one is the target.
    const roundsRes = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ? ORDER BY COALESCE(session_no, 1) ASC')
      .bind(employee_id, today)
      .all()
    const rounds = (roundsRes.results || []) as Array<{
      id: string
      session_no: number | null
      check_in: string | null
      check_out: string | null
      status: string
      sales_point_id: string | null
      shift_id: string | null
    }>

    if (rounds.length === 0) {
      return Response.json({ error: 'ยังไม่ได้เช็คอินวันนี้' }, { status: 400 })
    }

    const openRounds = rounds.filter(r => r.check_in && !r.check_out)
    const existing = openRounds[openRounds.length - 1] || null

    if (!existing) {
      const withIn = rounds.filter(r => r.check_in)
      if (withIn.length === 0) {
        return Response.json({ error: 'ยังไม่ได้เช็คอิน' }, { status: 400 })
      }
      const last = withIn[withIn.length - 1]
      return Response.json({ error: 'เช็คเอาต์ไปแล้ววันนี้', check_out: last.check_out }, { status: 409 })
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
    const nowHHMM = getCurrentTimeString().slice(0, 5)

    // กะพิเศษ is overtime work with no shift behind it: every hour counts as
    // OT and there is no shift end to leave early from.
    const extraRound = (Number(existing.session_no) || 1) > 1

    // ออกก่อนเวลา: checkout before the scheduled end time (shift end or the
    // employee's fixed work_end)
    let endTimeStr: string | null = null
    let startTimeStr: string | null = null
    let shiftId: string | null = extraRound ? null : existing.shift_id
    if (!shiftId && !extraRound) {
      // No shift on the record — fall back to the branch's default shift
      try {
        const branch = await db.prepare('SELECT default_shift_id FROM sales_points WHERE id = ?')
          .bind(existing.sales_point_id || employee.sales_point_id || '').first() as any
        if (branch?.default_shift_id) shiftId = branch.default_shift_id
      } catch {}
    }
    if (shiftId) {
      const shift = await db.prepare('SELECT start_time, end_time FROM shifts WHERE id = ?')
        .bind(shiftId).first() as any
      if (shift?.end_time) endTimeStr = shift.end_time
      if (shift?.start_time) startTimeStr = shift.start_time
    }
    if (!extraRound && !endTimeStr && (employee as any).work_end) endTimeStr = String((employee as any).work_end)
    if (!extraRound && !startTimeStr && (employee as any).work_start) startTimeStr = String((employee as any).work_start)

    // The daily wage buys the whole shift, so the break is not deducted. OT is
    // only the time worked past the shift's end — the same rule the daily
    // approval sheet uses, so both agree.
    const totalHours = calculateHoursWorked(existing.check_in || '', checkOutTime)
    const shiftHours = scheduledWorkHours(startTimeStr, endTimeStr, 8)
    // A กะพิเศษ has no regular hours — all of it is OT
    const regularHours = extraRound ? 0 : Math.min(totalHours, shiftHours)
    // OT: daily-rate staff only, paid in whole 30-minute blocks
    const otHours = isOTEligible((employee as any).salary_type)
      ? (extraRound
        ? roundOTToHalfHour(totalHours)
        : overtimeHours(endTimeStr, nowHHMM, totalHours))
      : 0

    // Negative means before the scheduled end — normalised so a checkout just
    // after midnight on a day shift is not mistaken for leaving early.
    let earlyOut = 0
    if (!extraRound && endTimeStr && minutesFromScheduled(endTimeStr, nowHHMM) < 0) {
      earlyOut = 1
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
      session_no: Number(existing.session_no) || 1,
      offsite: offsite ? { location_name: offsite.location_name } : null,
      message: extraRound
        ? `เช็คเอาต์กะพิเศษ (OT ${Math.round(otHours * 10) / 10} ชม.): ${employee.name}`
        : earlyOut
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
