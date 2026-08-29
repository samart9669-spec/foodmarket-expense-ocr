import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Older databases predate the branch default shift
async function ensureDefaultShiftColumn(db: any) {
  try {
    await db.prepare('ALTER TABLE sales_points ADD COLUMN default_shift_id TEXT').run()
  } catch {
    // duplicate column — already present
  }
  try {
    await db.prepare('ALTER TABLE sales_points ADD COLUMN incentive_rate REAL DEFAULT 0').run()
  } catch {
    // duplicate column — already present
  }
}

export async function GET() {
  try {
    const { env } = getRequestContext()
    await ensureDefaultShiftColumn(env.DB)
    const result = await env.DB.prepare('SELECT * FROM sales_points ORDER BY id ASC').all()
    return Response.json({ salesPoints: result.results })
  } catch (error) {
    return Response.json({ error: 'Failed to fetch sales points' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { name, location, latitude, longitude, radius_meters, default_shift_id, incentive_rate } = body
    if (!name) return Response.json({ error: 'กรุณากรอกชื่อสาขา' }, { status: 400 })
    await ensureDefaultShiftColumn(env.DB)
    const id = `sp-${generateId()}`
    await env.DB.prepare(
      'INSERT INTO sales_points (id, name, location, latitude, longitude, radius_meters, default_shift_id, incentive_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, location || null, latitude || null, longitude || null, radius_meters || 200, default_shift_id || null, incentive_rate || 0).run()
    return Response.json({ id, name, location, latitude, longitude, radius_meters, default_shift_id })
  } catch (error) {
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { id, name, location, latitude, longitude, radius_meters, default_shift_id, incentive_rate } = body
    if (!id || !name) return Response.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
    await ensureDefaultShiftColumn(env.DB)
    await env.DB.prepare(
      'UPDATE sales_points SET name=?, location=?, latitude=?, longitude=?, radius_meters=?, default_shift_id=?, incentive_rate=? WHERE id=?'
    ).bind(name, location || null, latitude || null, longitude || null, radius_meters || 200, default_shift_id || null, incentive_rate || 0, id).run()
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'ต้องระบุ id' }, { status: 400 })
    await env.DB.prepare('DELETE FROM sales_points WHERE id=?').bind(id).run()
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}
