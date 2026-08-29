// Departments used for the late/diligence rules. หน้าร้าน and ครัวกลาง each have
// their own pay/deduct terms; ออฟฟิศ has no diligence allowance at all.
export type Department = 'sales' | 'kitchen' | 'office'

export const DEPARTMENT_LABELS: Record<Department, string> = {
  sales: 'หน้าร้าน',
  kitchen: 'ครัวกลาง',
  office: 'ออฟฟิศ',
}

/** Departments that receive a diligence allowance. */
export const DILIGENCE_DEPARTMENTS: Department[] = ['sales', 'kitchen']

export function departmentOfEmployee(
  employee: { job_title?: string | null; employee_type?: string | null }
): Department {
  const title = (employee.job_title || '').trim()
  if (title === 'sales') return 'sales'
  if (title === 'kitchen' || title === '') {
    return employee.employee_type === 'sales' ? 'sales' : 'kitchen'
  }
  // head_office or any custom title
  return 'office'
}

export function lateGraceKey(department: Department): string {
  return `late_grace_${department}`
}

/** Minutes of grace before a check-in counts as late, for this employee. */
export function graceMinutesFor(
  employee: { job_title?: string | null; employee_type?: string | null },
  settings: Record<string, string>,
  fallback = 15,
): number {
  const key = lateGraceKey(departmentOfEmployee(employee))
  const value = parseInt(settings[key] ?? '')
  return Number.isFinite(value) ? value : fallback
}

export interface DiligenceTerms {
  department: Department
  eligible: boolean
  grace_minutes: number
  /** Allowance paid for the period */
  amount: number
  /** Deducted when late */
  deduction: number
  /** 'period' = deduct once per pay period, 'incident' = deduct per late day */
  mode: 'period' | 'incident'
}

export function diligenceTermsFor(
  employee: { job_title?: string | null; employee_type?: string | null },
  settings: Record<string, string>,
): DiligenceTerms {
  const department = departmentOfEmployee(employee)
  const grace_minutes = graceMinutesFor(employee, settings)
  const eligible = DILIGENCE_DEPARTMENTS.includes(department)

  if (!eligible) {
    return { department, eligible, grace_minutes, amount: 0, deduction: 0, mode: 'period' }
  }

  return {
    department,
    eligible,
    grace_minutes,
    amount: parseFloat(settings[`diligence_amount_${department}`] ?? '0') || 0,
    deduction: parseFloat(settings[`diligence_deduction_${department}`] ?? '0') || 0,
    mode: (settings[`diligence_mode_${department}`] ?? 'period') === 'incident' ? 'incident' : 'period',
  }
}

/** Allowance paid and amount forfeited for a period with `lateDays` late days. */
export function diligenceForPeriod(terms: DiligenceTerms, lateDays: number): {
  allowance: number
  deduction: number
} {
  if (!terms.eligible) return { allowance: 0, deduction: 0 }
  if (lateDays <= 0) return { allowance: terms.amount, deduction: 0 }

  const raw = terms.mode === 'incident' ? lateDays * terms.deduction : terms.deduction
  // Never claw back more than the allowance when one is configured
  const deduction = terms.amount > 0 ? Math.min(raw, terms.amount) : raw
  return { allowance: terms.amount, deduction }
}
