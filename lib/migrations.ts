// Safe, idempotent schema migration: adds new columns/tables without touching
// existing data. Called from /api/migrate and automatically on admin login so
// production databases stay up to date after every deployment.
export async function runMigrations(db: any): Promise<string[]> {
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

  // Default shift for a branch — staff there follow it unless the daily
  // approval screen overrides the shift for a particular day.
  await run('ALTER TABLE sales_points ADD COLUMN default_shift_id TEXT', 'sales_points.default_shift_id')

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

  // Part-day leave: leave_unit 'hour' uses start_time/end_time on a single date
  await run("ALTER TABLE leave_requests ADD COLUMN leave_unit TEXT DEFAULT 'day'", 'leave_requests.leave_unit')
  await run('ALTER TABLE leave_requests ADD COLUMN start_time TEXT', 'leave_requests.start_time')
  await run('ALTER TABLE leave_requests ADD COLUMN end_time TEXT', 'leave_requests.end_time')
  await run('ALTER TABLE leave_requests ADD COLUMN hours REAL', 'leave_requests.hours')

  // Admin users table
  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('superadmin','admin','manager','approver','viewer')),
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

  // เบี้ยขยัน: หน้าร้านและครัวกลางใช้เกณฑ์คนละชุด ส่วนออฟฟิศไม่มีเบี้ยขยัน
  // (grace is still kept for office so lateness is still recorded).
  await run(`INSERT OR IGNORE INTO payroll_settings (key, value, label, category, unit) VALUES
    ('late_grace_sales', '15', 'สายเมื่อเกิน — หน้าร้าน', 'diligence', 'นาที'),
    ('late_grace_kitchen', '15', 'สายเมื่อเกิน — ครัวกลาง', 'diligence', 'นาที'),
    ('late_grace_office', '15', 'สายเมื่อเกิน — ออฟฟิศ (ไม่มีเบี้ยขยัน)', 'diligence', 'นาที'),
    ('diligence_amount_sales', '0', 'เบี้ยขยันที่จ่าย/รอบ — หน้าร้าน', 'diligence', '฿'),
    ('diligence_amount_kitchen', '0', 'เบี้ยขยันที่จ่าย/รอบ — ครัวกลาง', 'diligence', '฿'),
    ('diligence_deduction_sales', '500', 'ยอดหักเมื่อมาสาย — หน้าร้าน', 'diligence', '฿'),
    ('diligence_deduction_kitchen', '500', 'ยอดหักเมื่อมาสาย — ครัวกลาง', 'diligence', '฿'),
    ('diligence_mode_sales', 'period', 'รอบหัก หน้าร้าน — period = หักครั้งเดียวต่อรอบจ่าย, incident = หักทุกครั้งที่สาย', 'diligence', ''),
    ('diligence_mode_kitchen', 'period', 'รอบหัก ครัวกลาง — period = หักครั้งเดียวต่อรอบจ่าย, incident = หักทุกครั้งที่สาย', 'diligence', '')
  `, 'diligence settings seed')

  // Refresh labels on rows seeded by earlier versions (INSERT OR IGNORE keeps
  // the old text otherwise)
  await run(`UPDATE payroll_settings SET label = CASE key
      WHEN 'late_grace_sales' THEN 'สายเมื่อเกิน — หน้าร้าน'
      WHEN 'late_grace_kitchen' THEN 'สายเมื่อเกิน — ครัวกลาง'
      WHEN 'late_grace_office' THEN 'สายเมื่อเกิน — ออฟฟิศ (ไม่มีเบี้ยขยัน)'
      ELSE label END
    WHERE key IN ('late_grace_sales','late_grace_kitchen','late_grace_office')`,
    'diligence labels refreshed')

  // Carry the previous single set of values into both departments, once
  await run(`UPDATE payroll_settings SET value = (SELECT value FROM payroll_settings WHERE key = 'diligence_deduction')
             WHERE key IN ('diligence_deduction_sales','diligence_deduction_kitchen')
               AND EXISTS (SELECT 1 FROM payroll_settings WHERE key = 'diligence_deduction')`,
             'diligence deduction carried over')
  await run(`UPDATE payroll_settings SET value = (SELECT value FROM payroll_settings WHERE key = 'diligence_deduct_mode')
             WHERE key IN ('diligence_mode_sales','diligence_mode_kitchen')
               AND EXISTS (SELECT 1 FROM payroll_settings WHERE key = 'diligence_deduct_mode')`,
             'diligence mode carried over')
  await run("DELETE FROM payroll_settings WHERE key IN ('diligence_deduction','diligence_deduct_mode')",
            'old global diligence settings removed')

  // Diligence allowance actually paid on a payroll record
  await run('ALTER TABLE payroll ADD COLUMN diligence_allowance REAL DEFAULT 0', 'payroll.diligence_allowance')

  // Branch incentive rate (% of that branch's sales in the period). Kept as the
  // fallback for branches that have no tiered scale configured.
  await run('ALTER TABLE sales_points ADD COLUMN incentive_rate REAL DEFAULT 0', 'sales_points.incentive_rate')

  // ยอดขายบันทึกเป็นของสาขาต่อวัน ไม่ต้องระบุพนักงาน — incentive จ่ายให้คนที่มา
  // ทำงานวันนั้นอยู่แล้ว SQLite ไม่มี DROP NOT NULL จึงต้องสร้างตารางใหม่ ทำครั้ง
  // เดียวเมื่อคอลัมน์ยังเป็น NOT NULL อยู่
  try {
    const col = await db.prepare(
      `SELECT "notnull" AS nn FROM pragma_table_info('sales') WHERE name = 'employee_id'`
    ).first() as any
    if (col && Number(col.nn) === 1) {
      await db.batch([
        db.prepare(`
          CREATE TABLE sales_rebuild (
            id TEXT PRIMARY KEY,
            employee_id TEXT,
            sales_point_id TEXT NOT NULL,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
          )
        `),
        db.prepare(`INSERT INTO sales_rebuild (id, employee_id, sales_point_id, date, amount, notes, created_at)
                    SELECT id, employee_id, sales_point_id, date, amount, notes, created_at FROM sales`),
        db.prepare('DROP TABLE sales'),
        db.prepare('ALTER TABLE sales_rebuild RENAME TO sales'),
      ])
      results.push('✓ sales.employee_id optional')
    } else {
      results.push('~ sales.employee_id optional (already)')
    }
  } catch (e: any) {
    results.push(`✗ sales.employee_id optional: ${e?.message}`)
  }

  // Tiered incentive: each branch pays a fixed amount once its sales pass a
  // threshold, e.g. Fashion B >16,200 = 45, >18,000 = 50. shift_id lets one
  // branch carry a different scale for a particular shift.
  await run(`
    CREATE TABLE IF NOT EXISTS incentive_tiers (
      id TEXT PRIMARY KEY,
      sales_point_id TEXT NOT NULL,
      shift_id TEXT,
      min_sales REAL NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `, 'incentive_tiers table')
  await run('CREATE INDEX IF NOT EXISTS idx_incentive_tiers_point ON incentive_tiers(sales_point_id)',
            'incentive_tiers index')
  // Which sales figure the thresholds are compared against:
  // 'daily' = that day's branch sales, paid for each day worked (default)
  // 'period' = the whole pay period's sales, paid once
  await run("ALTER TABLE sales_points ADD COLUMN incentive_basis TEXT DEFAULT 'daily'",
            'sales_points.incentive_basis')

  // Payroll breakdown for the new components
  await run('ALTER TABLE payroll ADD COLUMN incentive_total REAL DEFAULT 0', 'payroll.incentive_total')
  await run('ALTER TABLE payroll ADD COLUMN late_days INTEGER DEFAULT 0', 'payroll.late_days')
  await run('ALTER TABLE payroll ADD COLUMN diligence_deduction REAL DEFAULT 0', 'payroll.diligence_deduction')

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
  await run('ALTER TABLE attendance ADD COLUMN early_out INTEGER DEFAULT 0', 'attendance.early_out')
  await run('ALTER TABLE attendance ADD COLUMN offsite_request_id TEXT', 'attendance.offsite_request_id')
  // กะพิเศษ: more than one round of work on the same day. Round 1 is the normal
  // shift; a second, non-overlapping round gets session_no = 2 and so on.
  await run('ALTER TABLE attendance ADD COLUMN session_no INTEGER DEFAULT 1', 'attendance.session_no')
  // Whether this round pays a shift wage of its own (an extra round can be set
  // to OT only, so the daily rate is not paid twice)
  await run('ALTER TABLE attendance ADD COLUMN pay_wage INTEGER DEFAULT 1', 'attendance.pay_wage')

  // Offsite work requests
  await run(`
    CREATE TABLE IF NOT EXISTS offsite_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      location_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER DEFAULT 300,
      reason TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      admin_note TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )
  `, 'offsite_requests table')
  await run("ALTER TABLE employees ADD COLUMN salary_type TEXT DEFAULT 'daily'", 'employees.salary_type')
  await run('ALTER TABLE employees ADD COLUMN monthly_salary REAL DEFAULT 0', 'employees.monthly_salary')
  await run("ALTER TABLE employees ADD COLUMN job_title TEXT DEFAULT ''", 'employees.job_title')

  // Registered face photo — written by the employee form since the first
  // version but never part of schema.sql
  await run('ALTER TABLE employees ADD COLUMN face_photo TEXT', 'employees.face_photo')

  // Fixed work schedule for no-shift employees (head office 08:00-18:00 Mon-Fri)
  await run('ALTER TABLE employees ADD COLUMN work_start TEXT', 'employees.work_start')
  await run('ALTER TABLE employees ADD COLUMN work_end TEXT', 'employees.work_end')
  await run('ALTER TABLE employees ADD COLUMN work_days TEXT', 'employees.work_days')

  // Audit trail for manually corrected payroll records
  await run('ALTER TABLE payroll ADD COLUMN original_total_pay REAL', 'payroll.original_total_pay')
  await run('ALTER TABLE payroll ADD COLUMN edited_at TEXT', 'payroll.edited_at')
  await run('ALTER TABLE payroll ADD COLUMN edited_by TEXT', 'payroll.edited_by')

  // Payroll records belong to the admin account that created them, so each
  // login only works with its own list.
  await run('ALTER TABLE payroll ADD COLUMN created_by TEXT', 'payroll.created_by')

  // The original admin_users CHECK constraint predates the 'approver' role, so
  // rebuild the table once to accept it. Existing rows are copied across.
  try {
    const def = await db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'"
    ).first() as any
    if (def?.sql && !String(def.sql).includes('approver')) {
      await db.prepare(`
        CREATE TABLE admin_users_v2 (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('superadmin','admin','manager','approver','viewer')),
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `).run()
      await db.prepare(`
        INSERT INTO admin_users_v2 (id, username, password_hash, display_name, role, is_active, created_at)
        SELECT id, username, password_hash, display_name, role, is_active, created_at FROM admin_users
      `).run()
      await db.prepare('DROP TABLE admin_users').run()
      await db.prepare('ALTER TABLE admin_users_v2 RENAME TO admin_users').run()
      results.push('✓ admin_users role constraint (added approver)')
    } else {
      results.push('~ admin_users role constraint (already allows approver)')
    }
  } catch (e: any) {
    results.push(`✗ admin_users role constraint: ${e?.message}`)
  }

  return results
}
