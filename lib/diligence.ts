// Departments used for the late/diligence rules. Grace periods are configured
// separately for each, because shop floor, kitchen and office start differently.
export type Department = 'sales' | 'kitchen' | 'office'

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
