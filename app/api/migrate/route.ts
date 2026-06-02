import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

// Safe migration: add new columns/tables without destroying existing data.
// Runs are idempotent — safe to call multiple times.
export async function POST() {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const results: string[] = []

    const run = async (sql: string, label: string) => {
      try {
        await db.prepare(sql).run()
        results.push(`✓ ${label}`)
      } catch (e: any) {
        // Ignore "duplicate column" errors (already migrated)
        if (e?.message?.includes('duplicate column') || e?.message?.includes('already exists')) {
          results.push(`~ ${label} (already exists)`)
        } else {
          results.push(`✗ ${label}: ${e?.message}`)
        }
      }
    }

    // GPS columns on sales_points
    await run('ALTER TABLE sales_points ADD COLUMN latitude REAL', 'sales_points.latitude')
    await run('ALTER TABLE sales_points ADD COLUMN longitude REAL', 'sales_points.longitude')
    await run('ALTER TABLE sales_points ADD COLUMN radius_meters INTEGER DEFAULT 200', 'sales_points.radius_meters')

    // GPS columns on attendance
    await run('ALTER TABLE attendance ADD COLUMN check_in_lat REAL', 'attendance.check_in_lat')
    await run('ALTER TABLE attendance ADD COLUMN check_in_lng REAL', 'attendance.check_in_lng')
    await run('ALTER TABLE attendance ADD COLUMN check_out_lat REAL', 'attendance.check_out_lat')
    await run('ALTER TABLE attendance ADD COLUMN check_out_lng REAL', 'attendance.check_out_lng')

    // leave_requests table
    await run(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date_start TEXT NOT NULL,
        date_end TEXT NOT NULL,
        leave_type TEXT NOT NULL CHECK(leave_type IN ('sick','annual','personal','emergency')),
        reason TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
        admin_note TEXT,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      )
    `, 'leave_requests table')

    // Admin users table
    await run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('superadmin','admin','manager','viewer')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, 'admin_users table')

    // Admin sessions table
    await run(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, 'admin_sessions table')

    return Response.json({ ok: true, results })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
