import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { isAdminAuthorized } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { env } = getRequestContext()
  const user = await isAdminAuthorized(request, env.DB, 'admin')
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = env.DB
    const { id } = params
    await db.prepare('DELETE FROM attendance WHERE employee_id = ?').bind(id).run()
    await db.prepare('DELETE FROM leave_requests WHERE employee_id = ?').bind(id).run()
    await db.prepare('DELETE FROM employees WHERE id = ?').bind(id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('Admin DELETE /api/admin/employees/[id]:', error)
    return Response.json({ error: 'Failed to delete employee' }, { status: 500 })
  }
}
