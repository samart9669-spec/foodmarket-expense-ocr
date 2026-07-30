import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { getTodayString } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Per-record time correction. Records scanned while an old deployment was in
// use hold UTC and read 7 hours early, but records from the current build are
// already Bangkok time — so the shift must be applied one record at a time,
// never in bulk.

// Thai shifts effectively never start between midnight and 05:00, so a
// check-in in that window is almost certainly a UTC value.
function isSuspicious(checkIn: string | null): boolean {
  if (!checkIn) return false
  const m = checkIn.match(/(\d{2}):(\d{2})/)
  if (!m) return false
  const hour = Number(m[1])
  return hour < 5
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'admin')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const days = Math.min(Number(searchParams.get('days')) || 14, 90)
    const today = getTodayString()

    const rows = await db.prepare(`
      SELECT a.id, a.date, a.check_in, a.check_out, a.early_out, e.name AS employee_name
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE a.check_in IS NOT NULL AND a.date >= date(?, '-' || ? || ' days')
      ORDER BY a.date DESC, a.check_in ASC
      LIMIT 200
    `).bind(today, days).all()

    const records = (rows.results || []).map((r: any) => ({
      ...r,
      suspicious: isSuspicious(r.check_in),
    }))

    return Response.json({
      records,
      suspicious_count: records.filter((r: any) => r.suspicious).length,
    })
  } catch (error) {
    console.error('GET /api/admin/fix-timezone error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'admin')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as { ids?: string[]; hours?: number }
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
    const hours = Number(body.hours)

    if (ids.length === 0) return Response.json({ error: 'ต้องระบุรายการที่จะแก้' }, { status: 400 })
    if (![7, -7].includes(hours)) return Response.json({ error: 'hours ต้องเป็น 7 หรือ -7' }, { status: 400 })

    const shift = `${hours > 0 ? '+' : '-'}${Math.abs(hours)} hours`
    const statements = ids.map(id => db.prepare(`
      UPDATE attendance
      SET check_in  = datetime(check_in, ?),
          check_out = CASE WHEN check_out IS NOT NULL THEN datetime(check_out, ?) ELSE NULL END,
          date      = date(datetime(check_in, ?))
      WHERE id = ? AND check_in IS NOT NULL
    `).bind(shift, shift, shift, id))

    await db.batch(statements)

    return Response.json({ success: true, updated: ids.length, hours })
  } catch (error) {
    console.error('POST /api/admin/fix-timezone error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
