import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { isAdminAuthorized } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAdminAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const body = await request.json() as {
      check_in?: string | null
      check_out?: string | null
    }

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
