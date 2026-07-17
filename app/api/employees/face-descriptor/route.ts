import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Public endpoint — called by the kiosk FaceScanner to cache a computed
// face descriptor so subsequent sessions skip the slow extraction step.
// Only updates face_descriptor; no sensitive fields are exposed.
export async function PUT(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as { employee_id: string; face_descriptor: string }
    const { employee_id, face_descriptor } = body

    if (!employee_id || !face_descriptor) {
      return Response.json({ error: 'employee_id and face_descriptor are required' }, { status: 400 })
    }

    await db.prepare(
      'UPDATE employees SET face_descriptor = ? WHERE id = ? AND is_active = 1'
    ).bind(face_descriptor, employee_id).run()

    return Response.json({ ok: true })
  } catch (error) {
    console.error('PUT /api/employees/face-descriptor error:', error)
    return Response.json({ error: 'Failed to save face descriptor' }, { status: 500 })
  }
}
