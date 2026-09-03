import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { attendanceStatusFor, isRecalculable } from '@/lib/attendance-status'
import { graceMinutesFor, departmentOfEmployee, DEPARTMENT_LABELS } from '@/lib/diligence'
import { ensureAttendanceStatusColumns } from '@/lib/db-tables'
import { getTodayString, roundOTToHalfHour, isOTEligible, overtimeHours } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Recomputes the stored attendance status for past records.
//
// Records written before the late calculation was fixed can be wrong in both
// directions: an early check-in was counted as ~23 hours late, and a genuinely
// late check-in was stored as "present" when no shift could be resolved at scan
// time. The statistics sheet reads the stored status, so it has to be rebuilt.

interface Row {
  id: string
  employee_id: string
  employee_name: string | null
  date: string
  check_in: string | null
  check_out: string | null
  status: string | null
  early_out: number | null
  ot_hours: number | null
  job_title: string | null
  employee_type: string | null
  salary_type: string | null
  work_start: string | null
  work_end: string | null
  shift_start: string | null
  shift_end: string | null
}

/**
 * Hours between two stored timestamps ("YYYY-MM-DD HH:MM:SS"), parsed by hand
 * so the result never depends on the runtime's date-string parsing.
 */
function hoursBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const parse = (s: string) => {
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
    if (!m) return null
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  }
  const a = parse(from), b = parse(to)
  if (a === null || b === null) return null
  return Math.max(0, (b - a) / 3600000)
}

function hhmm(s: string | null): string {
  if (!s) return '-'
  const m = s.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '-'
}

async function loadChanges(db: any, from: string, to: string) {
  await ensureAttendanceStatusColumns(db)

  const [attRes, settingsRes] = await Promise.all([
    db.prepare(`
      SELECT a.id, a.employee_id, a.date, a.check_in, a.check_out, a.status, a.early_out, a.ot_hours,
             e.name AS employee_name, e.job_title, e.employee_type, e.salary_type, e.work_start, e.work_end,
             s.start_time AS shift_start, s.end_time AS shift_end
      FROM attendance a
      JOIN employees e ON e.id = a.employee_id
      -- Branch worked that day, otherwise the employee's own branch
      LEFT JOIN sales_points sp ON sp.id = COALESCE(a.sales_point_id, e.sales_point_id)
      -- Shift saved on the record wins; otherwise the branch's default shift
      LEFT JOIN shifts s ON s.id = COALESCE(a.shift_id, sp.default_shift_id)
      WHERE a.date BETWEEN ? AND ? AND a.check_in IS NOT NULL
      ORDER BY a.date DESC, e.name ASC
    `).bind(from, to).all(),
    db.prepare('SELECT key, value FROM payroll_settings').all(),
  ])

  const settings: Record<string, string> = {}
  for (const row of (settingsRes.results || []) as any[]) settings[row.key] = row.value

  const changes: any[] = []
  let scanned = 0
  let skippedManual = 0
  let unknownSchedule = 0

  for (const row of (attRes.results || []) as Row[]) {
    scanned++

    if (!isRecalculable(row.status)) {
      // ลา / ขาดงาน / ครึ่งวัน and manual overrides are never touched
      skippedManual++
      continue
    }

    const scheduledStart = row.shift_start || row.work_start || null
    const scheduledEnd = row.shift_end || row.work_end || null
    if (!scheduledStart) unknownSchedule++

    const grace = graceMinutesFor(row, settings)
    const result = attendanceStatusFor({
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      check_in: row.check_in,
      check_out: row.check_out,
      grace_minutes: grace,
    })
    if (!result.status) continue

    // OT is rebuilt as the time worked past the shift's end time — arriving
    // early is not overtime. Falls back to simply rounding whatever was stored
    // when the schedule or the checkout is unknown.
    const currentOt = Number(row.ot_hours) || 0
    const worked = hoursBetween(row.check_in, row.check_out)
    const otFromTimes = worked !== null && scheduledEnd && row.check_out
      ? overtimeHours(scheduledEnd, row.check_out, worked)
      : null
    const newOt = isOTEligible(row.salary_type)
      ? (otFromTimes ?? roundOTToHalfHour(currentOt))
      : 0

    const currentStatus = (row.status ?? '').trim() || 'present'
    const currentEarly = row.early_out ? 1 : 0
    if (currentStatus === result.status && currentEarly === result.early_out && currentOt === newOt) continue

    changes.push({
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      department: DEPARTMENT_LABELS[departmentOfEmployee(row)],
      date: row.date,
      check_in: hhmm(row.check_in),
      check_out: hhmm(row.check_out),
      shift_start: hhmm(scheduledStart),
      grace_minutes: grace,
      late_minutes: result.late_minutes,
      from_status: currentStatus,
      to_status: result.status,
      from_early_out: currentEarly,
      to_early_out: result.early_out,
      from_ot_hours: Math.round(currentOt * 100) / 100,
      to_ot_hours: newOt,
      unknown_schedule: result.unknown_schedule,
    })
  }

  return { scanned, skippedManual, unknownSchedule, changes }
}

function range(searchParams: URLSearchParams): { from: string; to: string } {
  const month = searchParams.get('month')
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
  }
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from && to) return { from, to }
  // Default: everything up to today
  return { from: '2000-01-01', to: getTodayString() }
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'admin')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const { from, to } = range(searchParams)
    const data = await loadChanges(db, from, to)

    return Response.json({ from, to, ...data })
  } catch (error) {
    console.error('GET /api/admin/recalc-status error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'admin')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as {
      month?: string
      from?: string
      to?: string
      ids?: string[]
    }

    const params = new URLSearchParams()
    if (body.month) params.set('month', body.month)
    if (body.from) params.set('from', body.from)
    if (body.to) params.set('to', body.to)
    const { from, to } = range(params)

    const data = await loadChanges(db, from, to)

    // When ids are given only those rows are rewritten; otherwise all of them
    const wanted = Array.isArray(body.ids) && body.ids.length > 0 ? new Set(body.ids) : null
    const toApply = wanted ? data.changes.filter(c => wanted.has(c.id)) : data.changes

    if (toApply.length === 0) {
      return Response.json({ success: true, updated: 0, from, to, message: 'ไม่มีรายการที่ต้องแก้ไข' })
    }

    // D1 batches are capped in practice — write in chunks
    const CHUNK = 50
    for (let i = 0; i < toApply.length; i += CHUNK) {
      const statements = toApply.slice(i, i + CHUNK).map(c =>
        db.prepare('UPDATE attendance SET status = ?, early_out = ?, ot_hours = ? WHERE id = ?')
          .bind(c.to_status, c.to_early_out, c.to_ot_hours, c.id)
      )
      await db.batch(statements)
    }

    return Response.json({
      success: true,
      updated: toApply.length,
      from,
      to,
      to_late: toApply.filter(c => c.to_status === 'late').length,
      to_present: toApply.filter(c => c.to_status === 'present').length,
      ot_fixed: toApply.filter(c => c.from_ot_hours !== c.to_ot_hours).length,
    })
  } catch (error) {
    console.error('POST /api/admin/recalc-status error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
