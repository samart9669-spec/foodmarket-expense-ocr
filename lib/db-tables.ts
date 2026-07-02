// On-demand table creation so features work even on databases that haven't
// run /api/migrate yet. Keep DDL in sync with app/api/migrate/route.ts.
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
}
