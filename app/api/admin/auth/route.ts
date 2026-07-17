import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { loginUser, verifySession } from '@/lib/admin-auth'
import { runMigrations } from '@/lib/migrations'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json() as { username: string; password: string }
    if (!username || !password) {
      return Response.json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }, { status: 400 })
    }
    const { env } = getRequestContext()

    // Keep the database schema current on every login — makes deployments
    // self-updating without a manual /api/migrate call. Never blocks login.
    try { await runMigrations(env.DB) } catch {}

    const result = await loginUser(env.DB, username.trim(), password)
    if (!result) return Response.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    return Response.json({ token: result.token, role: result.role, display_name: result.display_name, username: username.trim() })
  } catch (e) {
    console.error('POST /api/admin/auth:', e)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return Response.json({ valid: false }, { status: 401 })
    const { env } = getRequestContext()
    const user = await verifySession(env.DB, auth.slice(7))
    if (!user) return Response.json({ valid: false }, { status: 401 })
    return Response.json({ valid: true, ...user })
  } catch { return Response.json({ valid: false }, { status: 401 }) }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7)
      if (!token.startsWith('env:')) {
        const { env } = getRequestContext()
        await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run()
      }
    }
  } catch {}
  return Response.json({ ok: true })
}
