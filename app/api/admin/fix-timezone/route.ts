import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// One-time repair for attendance rows written before check-in/out started
// storing Bangkok wall-clock time. Those rows hold UTC, so they read 7 hours
// early. Rows are marked with tz_fixed=1 so the shift can never be applied
// twice, even if this endpoint is called repeatedly.
async function ensureFixedColumn(db: any) {
  try {
    await db.prepare('ALTER TABLE attendance ADD COLUMN tz_fixed INTEGER DEFAULT 0').run()
  } catch {
    // duplicate column — already present
  }
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run()
  } catch {}
}

// Global one-shot guard: once the repair has run, rows recorded afterwards are
// already Bangkok time, so the shift must never be applied again.
async function fixAppliedAt(db: any): Promise<string | null> {
  try {
    const row = await db.prepare("SELECT value FROM app_settings WHERE key = 'tz_fix_applied_at'").first() as any
    return row?.value ?? null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'admin')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })
    await ensureFixedColumn(db)

    const appliedAt = await fixAppliedAt(db)

    const pending = appliedAt ? { count: 0 } : await db.prepare(`
      SELECT COUNT(*) AS count FROM attendance
      WHERE COALESCE(tz_fixed, 0) = 0 AND check_in IS NOT NULL
    `).first() as any

    const sample = await db.prepare(`
      SELECT a.date, a.check_in, a.check_out, e.name AS employee_name,
             COALESCE(a.tz_fixed, 0) AS tz_fixed
      FROM attendance a LEFT JOIN employees e ON a.employee_id = e.id
      WHERE a.check_in IS NOT NULL
      ORDER BY a.date DESC, a.check_in DESC LIMIT 15
    `).all()

    return Response.json({
      pending_count: pending?.count ?? 0,
      applied_at: appliedAt,
      recent: sample.results,
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
    await ensureFixedColumn(db)

    const appliedAt = await fixAppliedAt(db)
    if (appliedAt) {
      return Response.json({
        success: true,
        fixed: 0,
        already_applied: true,
        applied_at: appliedAt,
      })
    }

    const before = await db.prepare(`
      SELECT COUNT(*) AS count FROM attendance
      WHERE COALESCE(tz_fixed, 0) = 0 AND check_in IS NOT NULL
    `).first() as any

    await db.prepare(`
      UPDATE attendance
      SET check_in  = datetime(check_in, '+7 hours'),
          check_out = CASE WHEN check_out IS NOT NULL THEN datetime(check_out, '+7 hours') ELSE NULL END,
          date      = date(datetime(check_in, '+7 hours')),
          tz_fixed  = 1
      WHERE COALESCE(tz_fixed, 0) = 0 AND check_in IS NOT NULL
    `).run()

    // Record that the one-time repair has run — later scans already store
    // Bangkok time and must never be shifted again.
    await db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('tz_fix_applied_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(new Date().toISOString()).run()

    return Response.json({ success: true, fixed: before?.count ?? 0 })
  } catch (error) {
    console.error('POST /api/admin/fix-timezone error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
