import { lateMinutes, minutesFromScheduled } from './utils'

/**
 * Single source of truth for the daily attendance status.
 *
 * Used both when a scan is recorded and when historical records are
 * recalculated, so the scan screen, the daily-approval sheet and the
 * absence/late statistics can never disagree with one another.
 */
export interface AttendanceScheduleInput {
  /** Shift start ("HH:MM"), or the employee's fixed work_start. Null = unknown */
  scheduled_start: string | null
  /** Shift end ("HH:MM"), or the employee's fixed work_end. Null = unknown */
  scheduled_end?: string | null
  /** Stored check-in — "HH:MM", "HH:MM:SS" or a full timestamp */
  check_in: string | null
  check_out?: string | null
  /** Minutes of grace configured for the employee's department */
  grace_minutes: number
}

export interface AttendanceStatusResult {
  /** null when there is no check-in — the caller keeps whatever it had */
  status: 'present' | 'late' | null
  late_minutes: number
  early_out: 0 | 1
  /** true when no shift or personal schedule could be resolved */
  unknown_schedule: boolean
}

export function attendanceStatusFor(input: AttendanceScheduleInput): AttendanceStatusResult {
  const { scheduled_start, scheduled_end, check_in, check_out, grace_minutes } = input

  if (!check_in) {
    return { status: null, late_minutes: 0, early_out: 0, unknown_schedule: !scheduled_start }
  }

  const late = scheduled_start ? lateMinutes(scheduled_start, check_in, grace_minutes) : 0
  const early_out = check_out && scheduled_end && minutesFromScheduled(scheduled_end, check_out) < 0 ? 1 : 0

  return {
    status: late > 0 ? 'late' : 'present',
    late_minutes: late,
    early_out,
    unknown_schedule: !scheduled_start,
  }
}

/**
 * Statuses a recalculation is allowed to overwrite. Anything else — ลา,
 * ขาดงาน, ครึ่งวัน and any manual override — is left untouched.
 */
export const RECALCULABLE_STATUSES = ['present', 'late', '', 'null']

export function isRecalculable(status: string | null | undefined): boolean {
  return RECALCULABLE_STATUSES.includes((status ?? '').trim())
}
