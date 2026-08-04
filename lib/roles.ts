// Role definitions shared by client components and server routes.
// Kept free of server-only imports so pages can use it directly.

export type AdminRole = 'superadmin' | 'admin' | 'manager' | 'approver' | 'viewer'

// 'approver' is a restricted role, not a rung on the ladder: it sits at the
// lowest level so it inherits no admin powers, and is instead granted the one
// page it needs through RESTRICTED_ROLE_PATHS below.
export const ROLE_LEVEL: Record<AdminRole, number> = {
  superadmin: 4, admin: 3, manager: 2, viewer: 1, approver: 1,
}

export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'เจ้าของระบบ',
  admin: 'ผู้จัดการ',
  manager: 'หัวหน้างาน',
  approver: 'ผู้อนุมัติเวลางาน',
  viewer: 'ผู้ดูแล (อ่านอย่างเดียว)',
}

export const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-800 border-purple-300',
  admin: 'bg-red-100 text-red-800 border-red-300',
  manager: 'bg-blue-100 text-blue-800 border-blue-300',
  approver: 'bg-teal-100 text-teal-800 border-teal-300',
  viewer: 'bg-gray-100 text-gray-700 border-gray-300',
}

export function hasPermission(userRole: string, required: string): boolean {
  return (ROLE_LEVEL[userRole as AdminRole] ?? 0) >= (ROLE_LEVEL[required as AdminRole] ?? 0)
}

// Roles limited to a fixed set of pages. A role listed here can open only
// these paths (and nothing else) in the admin area.
export const RESTRICTED_ROLE_PATHS: Record<string, string[]> = {
  approver: ['/attendance/daily-approval'],
}

export function isRestrictedRole(role: string): boolean {
  return !!RESTRICTED_ROLE_PATHS[role]
}

/** Landing page for a restricted role, or '/' for unrestricted roles. */
export function getHomePathForRole(role: string): string {
  return RESTRICTED_ROLE_PATHS[role]?.[0] ?? '/'
}

export function canAccessPath(role: string, pathname: string): boolean {
  const allowed = RESTRICTED_ROLE_PATHS[role]
  if (!allowed) return true
  return allowed.some(p => pathname === p || pathname.startsWith(p + '/'))
}
