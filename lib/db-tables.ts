// On-demand table creation so features work even on databases that haven't
// run /api/migrate yet. Keep DDL in sync with app/api/migrate/route.ts.

export async function ensureAttendanceApprovedColumn(db: any) {
  try {
    await db.prepare('ALTER TABLE attendance ADD COLUMN approved INTEGER DEFAULT 0').run()
  } catch {
    // duplicate column — already present
  }
}

// early_out: checked out before scheduled end time (ออกก่อนเวลา)
// offsite_request_id: links to the approved offsite-work request used that day
export async function ensureAttendanceStatusColumns(db: any) {
  for (const column of ['early_out INTEGER DEFAULT 0', 'offsite_request_id TEXT']) {
    try {
      await db.prepare(`ALTER TABLE attendance ADD COLUMN ${column}`).run()
    } catch {
      // duplicate column — already present
    }
  }
}

// คำขอปฏิบัติงานนอกสถานที่ — approved requests let that employee check in/out
// at the attached location on the requested date only.
export async function ensureOffsiteRequestsTable(db: any) {
  await db.prepare(`
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
  `).run()
}

// Approved offsite request for one employee on one date, or null.
export async function getApprovedOffsite(db: any, employeeId: string, date: string): Promise<any | null> {
  try {
    await ensureOffsiteRequestsTable(db)
    return await db.prepare(
      "SELECT * FROM offsite_requests WHERE employee_id = ? AND date = ? AND status = 'approved' LIMIT 1"
    ).bind(employeeId, date).first()
  } catch {
    return null
  }
}

// Fixed work-schedule columns for employees without shifts (e.g. head office
// staff working 08:00-18:00 Mon-Fri). work_days is comma-separated JS day
// numbers (0=Sun ... 6=Sat), e.g. '1,2,3,4,5'.
export async function ensureEmployeeScheduleColumns(db: any) {
  for (const column of ['work_start TEXT', 'work_end TEXT', 'work_days TEXT']) {
    try {
      await db.prepare(`ALTER TABLE employees ADD COLUMN ${column}`).run()
    } catch {
      // duplicate column — already present
    }
  }
}
export async function ensureLeaveRequestsTable(db: any) {
  await db.prepare(`
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
  `).run()

  // Tables created by older versions lack these columns — add them in place.
  // (ALTER TABLE ADD COLUMN can't use non-constant defaults, so created_at has none here.)
  for (const column of ['admin_note TEXT', 'reviewed_at TEXT', 'reason TEXT', "status TEXT DEFAULT 'pending'", 'created_at TEXT']) {
    try {
      await db.prepare(`ALTER TABLE leave_requests ADD COLUMN ${column}`).run()
    } catch {
      // duplicate column — already present
    }
  }
}
