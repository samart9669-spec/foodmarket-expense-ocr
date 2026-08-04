import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { isAdminAuthorized, hashPassword, AdminRole } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'superadmin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as {
      display_name?: string
      role?: AdminRole
      password?: string
      is_active?: number
    }

    const updates: string[] = []
    const values: any[] = []

    if (body.display_name !== undefined) {
      updates.push('display_name = ?')
      values.push(body.display_name.trim())
    }
    if (body.role !== undefined) {
      const validRoles: AdminRole[] = ['superadmin', 'admin', 'manager', 'approver', 'viewer']
      if (!validRoles.includes(body.role)) return Response.json({ error: 'Role ไม่ถูกต้อง' }, { status: 400 })
      updates.push('role = ?')
      values.push(body.role)
    }
    if (body.password !== undefined && body.password.length >= 6) {
      // Need username to compute hash
      const u = await env.DB.prepare('SELECT username FROM admin_users WHERE id = ?').bind(params.id).first() as any
      if (u) {
        const hash = await hashPassword(u.username, body.password)
        updates.push('password_hash = ?')
        values.push(hash)
        // Invalidate all sessions for this user
        await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(params.id).run()
      }
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?')
      values.push(body.is_active)
      if (body.is_active === 0) {
        await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(params.id).run()
      }
    }

    if (updates.length === 0) return Response.json({ error: 'ไม่มีข้อมูลที่ต้องอัปเดต' }, { status: 400 })

    values.push(params.id)
    await env.DB.prepare(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()

    const updated = await env.DB.prepare(
      'SELECT id, username, display_name, role, is_active FROM admin_users WHERE id = ?'
    ).bind(params.id).first()
    return Response.json({ user: updated })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'superadmin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Check target user is not the last superadmin
    const target = await env.DB.prepare('SELECT * FROM admin_users WHERE id = ?').bind(params.id).first() as any
    if (!target) return Response.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    if (target.username === user.username) return Response.json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' }, { status: 400 })

    await env.DB.prepare('DELETE FROM admin_sessions WHERE user_id = ?').bind(params.id).run()
    await env.DB.prepare('DELETE FROM admin_users WHERE id = ?').bind(params.id).run()
    return Response.json({ success: true })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to delete user' }, { status: 500 })
  }
}
