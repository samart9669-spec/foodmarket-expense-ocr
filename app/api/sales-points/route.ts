import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

export async function GET() {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const result = await db.prepare('SELECT * FROM sales_points ORDER BY id ASC').all()
    return Response.json({ salesPoints: result.results })
  } catch (error) {
    console.error('GET /api/sales-points error:', error)
    return Response.json({ error: 'Failed to fetch sales points' }, { status: 500 })
  }
}
