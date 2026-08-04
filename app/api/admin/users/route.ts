import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { isAdminAuthorized, hashPassword, AdminRole } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'superadmin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { results } = await env.DB.prepare(
      'SELECT id, username, display_name, role, is_active, created_at FROM admin_users ORDER BY created_at ASC'
    ).all()
    return Response.json({ users: results })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'superadmin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { username, password, display_name, role } = await request.json() as {
      username: string; password: string; display_name: string; role: AdminRole
    }
    if (!username || !password || !display_name || !role) {
      return Response.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 })
    }
    const validRoles: AdminRole[] = ['superadmin', 'admin', 'manager', 'approver', 'viewer']
    if (!validRoles.includes(role)) {
      return Response.json({ error: 'Role ไม่ถูกต้อง' }, { status: 400 })
    }

    const password_hash = await hashPassword(username.trim().toLowerCase(), password)
    const id = crypto.randomUUID()
    await env.DB.prepare(
      'INSERT INTO admin_users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, username.trim().toLowerCase(), password_hash, display_name.trim(), role).run()

    return Response.json({ id, username: username.trim().toLowerCase(), display_name, role, is_active: 1 })
  } catch (e: any) {
    if (e?.message?.includes('UNIQUE')) return Response.json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' }, { status: 409 })
    return Response.json({ error: e?.message || 'Failed to create user' }, { status: 500 })
  }
}
