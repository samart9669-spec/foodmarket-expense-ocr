import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

export async function GET() {
  try {
    const { env } = getRequestContext()
    const result = await env.DB.prepare('SELECT * FROM shifts ORDER BY start_time ASC').all()
    return Response.json({ shifts: result.results })
  } catch (error) {
    console.error('GET /api/shifts error:', error)
    return Response.json({ error: 'Failed to fetch shifts' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { name, start_time, end_time, regular_hours, break_minutes } = body

    if (!name || !start_time || !end_time) {
      return Response.json({ error: 'กรุณากรอกชื่อกะ เวลาเริ่ม และเวลาสิ้นสุด' }, { status: 400 })
    }

    const id = `shift-${Date.now()}`
    const brk = break_minutes ?? 60
    const hours = regular_hours ?? calcHours(start_time, end_time)

    await env.DB.prepare(
      'INSERT INTO shifts (id, name, start_time, end_time, regular_hours, break_minutes) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, name, start_time, end_time, hours, brk).run()

    return Response.json({ id, name, start_time, end_time, regular_hours: hours, break_minutes: brk })
  } catch (error) {
    console.error('POST /api/shifts error:', error)
    return Response.json({ error: 'Failed to create shift' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { id, name, start_time, end_time, regular_hours, break_minutes } = body

    if (!id || !name || !start_time || !end_time) {
      return Response.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
    }

    const brk = break_minutes ?? 60
    const hours = regular_hours ?? calcHours(start_time, end_time)

    await env.DB.prepare(
      'UPDATE shifts SET name=?, start_time=?, end_time=?, regular_hours=?, break_minutes=? WHERE id=?'
    ).bind(name, start_time, end_time, hours, brk, id).run()

    return Response.json({ success: true })
  } catch (error) {
    console.error('PUT /api/shifts error:', error)
    return Response.json({ error: 'Failed to update shift' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { env } = getRequestContext()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return Response.json({ error: 'ต้องระบุ id' }, { status: 400 })

    await env.DB.prepare('DELETE FROM shifts WHERE id=?').bind(id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/shifts error:', error)
    return Response.json({ error: 'Failed to delete shift' }, { status: 500 })
  }
}

// Hours the shift covers, start to end. The daily wage buys the whole shift,
// so the break stays inside it and is never deducted.
function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return Math.round((mins / 60) * 10) / 10
}
