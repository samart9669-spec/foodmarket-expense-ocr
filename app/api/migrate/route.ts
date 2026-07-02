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

    // Columns missing from leave_requests tables created by older versions
    await run('ALTER TABLE leave_requests ADD COLUMN admin_note TEXT', 'leave_requests.admin_note')
    await run('ALTER TABLE leave_requests ADD COLUMN reviewed_at TEXT', 'leave_requests.reviewed_at')

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

    await run('ALTER TABLE shifts ADD COLUMN break_minutes INTEGER DEFAULT 60', 'shifts.break_minutes')

    await run(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        unit TEXT DEFAULT ''
      )
    `, 'payroll_settings table')

    await run(`INSERT OR IGNORE INTO payroll_settings (key, value, label, category, unit) VALUES
      ('allowance_food', '50', 'ค่าอาหาร', 'allowance', '฿'),
      ('allowance_split_shift', '50', 'เบี้ยกะแยก', 'allowance', '฿'),
      ('allowance_site', '0', 'เบี้ยสถานที่', 'allowance', '฿'),
      ('holiday_wage_multiplier', '2.0', 'ตัวคูณค่าแรงวันหยุดนักขัตฤกษ์', 'daytype', 'x'),
      ('weekend_wage_multiplier', '1.0', 'ตัวคูณค่าแรงวันเสาร์-อาทิตย์', 'daytype', 'x'),
      ('ot_multiplier_weekday', '1.5', 'ตัวคูณ OT วันธรรมดา', 'ot', 'x'),
      ('ot_multiplier_weekend', '2.0', 'ตัวคูณ OT วันหยุดสุดสัปดาห์', 'ot', 'x'),
      ('ot_multiplier_holiday', '3.0', 'ตัวคูณ OT วันหยุดนักขัตฤกษ์', 'ot', 'x'),
      ('sso_rate', '5', 'อัตราประกันสังคม (SSO)', 'deduction', '%'),
      ('wht_rate', '3', 'ภาษีหัก ณ ที่จ่าย (WHT)', 'deduction', '%'),
      ('uniform_deposit', '0', 'ค่ามัดจำเครื่องแบบ', 'deduction', '฿')
    `, 'payroll_settings seed')

    // General app settings (head office GPS, etc.)
    await run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `, 'app_settings table')

    await run("ALTER TABLE attendance ADD COLUMN day_type TEXT DEFAULT 'normal'", 'attendance.day_type')
    await run('ALTER TABLE attendance ADD COLUMN food_allowance REAL DEFAULT 0', 'attendance.food_allowance')
    await run('ALTER TABLE attendance ADD COLUMN split_shift_allowance REAL DEFAULT 0', 'attendance.split_shift_allowance')
    await run('ALTER TABLE attendance ADD COLUMN cash_advance REAL DEFAULT 0', 'attendance.cash_advance')
    await run('ALTER TABLE attendance ADD COLUMN net_pay REAL DEFAULT 0', 'attendance.net_pay')
    await run('ALTER TABLE attendance ADD COLUMN approved INTEGER DEFAULT 0', 'attendance.approved')
    await run("ALTER TABLE employees ADD COLUMN salary_type TEXT DEFAULT 'daily'", 'employees.salary_type')
    await run('ALTER TABLE employees ADD COLUMN monthly_salary REAL DEFAULT 0', 'employees.monthly_salary')
    await run("ALTER TABLE employees ADD COLUMN job_title TEXT DEFAULT ''", 'employees.job_title')

    return Response.json({ ok: true, results })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
