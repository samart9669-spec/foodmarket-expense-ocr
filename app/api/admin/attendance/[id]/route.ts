import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { isAdminAuthorized } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'manager')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = env.DB
    const body = await request.json() as { check_in?: string | null; check_out?: string | null }
    await db.prepare(`
      UPDATE attendance SET
        check_in  = CASE WHEN ? IS NOT NULL THEN ? ELSE check_in  END,
        check_out = CASE WHEN ? IS NOT NULL THEN ? ELSE check_out END
      WHERE id = ?
    `).bind(
      body.check_in ?? null, body.check_in ?? null,
      body.check_out ?? null, body.check_out ?? null,
      params.id
    ).run()
    const record = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(params.id).first()
    return Response.json({ record })
  } catch (error) {
    console.error('Admin PATCH /api/admin/attendance/[id]:', error)
    return Response.json({ error: 'Failed to update attendance' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'admin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await env.DB.prepare('DELETE FROM attendance WHERE id = ?').bind(params.id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('Admin DELETE /api/admin/attendance/[id]:', error)
    return Response.json({ error: 'Failed to delete attendance' }, { status: 500 })
  }
}
