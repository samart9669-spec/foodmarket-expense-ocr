import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  try {
    const { env } = getRequestContext()
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
    const { name, location, latitude, longitude, radius_meters } = body
    if (!name) return Response.json({ error: 'กรุณากรอกชื่อสาขา' }, { status: 400 })
    const id = `sp-${generateId()}`
    await env.DB.prepare(
      'INSERT INTO sales_points (id, name, location, latitude, longitude, radius_meters) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, name, location || null, latitude || null, longitude || null, radius_meters || 200).run()
    return Response.json({ id, name, location, latitude, longitude, radius_meters })
  } catch (error) {
    return Response.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const body = await request.json() as any
    const { id, name, location, latitude, longitude, radius_meters } = body
    if (!id || !name) return Response.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
    await env.DB.prepare(
      'UPDATE sales_points SET name=?, location=?, latitude=?, longitude=?, radius_meters=? WHERE id=?'
    ).bind(name, location || null, latitude || null, longitude || null, radius_meters || 200, id).run()
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
