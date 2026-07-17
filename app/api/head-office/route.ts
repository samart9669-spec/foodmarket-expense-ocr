import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'
import { DEFAULT_RADIUS_METERS } from '@/lib/geo'

export const runtime = 'edge'

const KEYS = ['head_office_lat', 'head_office_lng', 'head_office_radius', 'head_office_address'] as const

// Self-healing: the table normally comes from /api/migrate, but create it here
// too so saving works even on databases that haven't run the migration yet.
async function ensureTable(db: any) {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run()
}

export async function GET() {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureTable(db)

    const rows = await db.prepare(
      `SELECT key, value FROM app_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`
    ).bind(...KEYS).all() as any
    const map: Record<string, string> = {}
    for (const r of rows.results || []) map[r.key] = r.value

    return Response.json({
      latitude: map.head_office_lat ? parseFloat(map.head_office_lat) : null,
      longitude: map.head_office_lng ? parseFloat(map.head_office_lng) : null,
      radius_meters: parseInt(map.head_office_radius) || DEFAULT_RADIUS_METERS,
      address: map.head_office_address || '',
    })
  } catch (error) {
    console.error('GET /api/head-office error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureTable(db)

    const body = await request.json() as {
      latitude?: number | null
      longitude?: number | null
      radius_meters?: number
      address?: string
    }

    const upsert = (key: string, value: string) =>
      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(key, value)
    const remove = (key: string) =>
      db.prepare('DELETE FROM app_settings WHERE key = ?').bind(key)

    const statements = [
      body.latitude != null ? upsert('head_office_lat', String(body.latitude)) : remove('head_office_lat'),
      body.longitude != null ? upsert('head_office_lng', String(body.longitude)) : remove('head_office_lng'),
      upsert('head_office_radius', String(body.radius_meters || DEFAULT_RADIUS_METERS)),
      upsert('head_office_address', body.address || ''),
    ]
    await db.batch(statements)

    return Response.json({ success: true })
  } catch (error) {
    console.error('PUT /api/head-office error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
