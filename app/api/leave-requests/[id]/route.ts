import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { status, admin_note } = body

    if (!['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'status ต้องเป็น approved หรือ rejected' }, { status: 400 })
    }

    const now = new Date().toISOString()
    await env.DB.prepare(`
      UPDATE leave_requests SET status = ?, admin_note = ?, reviewed_at = ? WHERE id = ?
    `).bind(status, admin_note || null, now, params.id).run()

    return Response.json({ success: true })
  } catch (error) {
    console.error('PATCH /api/leave-requests/[id] error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
