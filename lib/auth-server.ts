export async function getRoleFromRequest(request: Request, db: any): Promise<string | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const session = await db.prepare(
      "SELECT role, expires_at FROM admin_sessions WHERE token = ?"
    ).bind(token).first() as { role: string; expires_at: string } | null
    if (!session) return null
    if (new Date(session.expires_at) < new Date()) return null
    return session.role
  } catch {
    return null
  }
}

// "Office" = any job_title that is not kitchen/sales (head_office, custom, etc.)
export function isOfficeEmployee(jobTitle: string | null | undefined): boolean {
  const t = (jobTitle || '').trim()
  return t !== '' && t !== 'kitchen' && t !== 'sales'
}
