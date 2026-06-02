import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export type AdminRole = 'superadmin' | 'admin' | 'manager' | 'viewer'

export interface SessionUser {
  username: string
  role: AdminRole
  display_name: string
}

const ROLE_LEVEL: Record<AdminRole, number> = {
  superadmin: 4, admin: 3, manager: 2, viewer: 1,
}

export function hasPermission(userRole: AdminRole, required: AdminRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

export async function hashPassword(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(username.toLowerCase() + '\x00' + password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function getEnvCreds() {
  try {
    const { env } = getRequestContext() as any
    return {
      username: (env.ADMIN_USERNAME as string) || 'admin',
      password: (env.ADMIN_PASSWORD as string) || 'admin1234',
    }
  } catch {
    return { username: 'admin', password: 'admin1234' }
  }
}

export async function loginUser(
  db: any,
  username: string,
  password: string,
): Promise<{ token: string; role: AdminRole; display_name: string } | null> {
  // 1. Try DB users first
  try {
    const user = await db.prepare(
      'SELECT * FROM admin_users WHERE username = ? AND is_active = 1'
    ).bind(username).first() as any

    if (user) {
      const hash = await hashPassword(username, password)
      if (hash !== user.password_hash) return null

      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await db.prepare(
        'INSERT INTO admin_sessions (token, user_id, username, role, expires_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(token, user.id, user.username, user.role, expiresAt).run()
      // Best-effort cleanup of stale sessions
      db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?')
        .bind(new Date().toISOString()).run().catch(() => {})
      return { token, role: user.role as AdminRole, display_name: user.display_name }
    }
  } catch { /* Table may not exist yet */ }

  // 2. Fallback: env-var superadmin (backward compat / bootstrap)
  const creds = getEnvCreds()
  if (username === creds.username && password === creds.password) {
    const token = 'env:' + btoa(`${username}:${password}`)
    return { token, role: 'superadmin', display_name: 'ผู้ดูแลระบบ' }
  }

  return null
}

export async function verifySession(db: any, token: string): Promise<SessionUser | null> {
  // Env-var pseudo-token
  if (token.startsWith('env:')) {
    try {
      const creds = getEnvCreds()
      const decoded = atob(token.slice(4))
      const colon = decoded.indexOf(':')
      const u = decoded.slice(0, colon)
      const p = decoded.slice(colon + 1)
      if (u === creds.username && p === creds.password) {
        return { username: u, role: 'superadmin', display_name: 'ผู้ดูแลระบบ' }
      }
    } catch {}
    return null
  }

  // DB session
  try {
    const session = await db.prepare(
      'SELECT s.*, u.display_name FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1'
    ).bind(token, new Date().toISOString()).first() as any
    if (!session) return null
    return { username: session.username, role: session.role as AdminRole, display_name: session.display_name }
  } catch { return null }
}

export async function isAdminAuthorized(
  request: NextRequest,
  db: any,
  requiredRole: AdminRole = 'admin',
): Promise<SessionUser | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const user = await verifySession(db, auth.slice(7))
  if (!user) return null
  if (!hasPermission(user.role, requiredRole)) return null
  return user
}
