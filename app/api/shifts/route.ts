import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

export async function GET() {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const result = await db.prepare('SELECT * FROM shifts ORDER BY start_time ASC').all()
    return Response.json({ shifts: result.results })
  } catch (error) {
    console.error('GET /api/shifts error:', error)
    return Response.json({ error: 'Failed to fetch shifts' }, { status: 500 })
  }
}
