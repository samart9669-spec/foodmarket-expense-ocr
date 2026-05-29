CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  employee_type TEXT NOT NULL CHECK(employee_type IN ('kitchen', 'sales')),
  sales_point_id TEXT,
  daily_rate REAL NOT NULL DEFAULT 350,
  ot_rate REAL NOT NULL DEFAULT 50,
  commission_rate REAL DEFAULT 0,
  face_descriptor TEXT,
  qr_code TEXT UNIQUE,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  regular_hours REAL NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS sales_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  shift_id TEXT,
  check_in TEXT,
  check_out TEXT,
  check_in_method TEXT CHECK(check_in_method IN ('face', 'qr', 'manual')),
  check_out_method TEXT CHECK(check_out_method IN ('face', 'qr', 'manual')),
  sales_point_id TEXT,
  regular_hours REAL DEFAULT 0,
  ot_hours REAL DEFAULT 0,
  status TEXT DEFAULT 'present' CHECK(status IN ('present', 'absent', 'late', 'half')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  sales_point_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (sales_point_id) REFERENCES sales_points(id)
);

CREATE TABLE IF NOT EXISTS payroll (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  days_worked INTEGER DEFAULT 0,
  day_rate_total REAL DEFAULT 0,
  ot_hours_total REAL DEFAULT 0,
  ot_total REAL DEFAULT 0,
  sales_total REAL DEFAULT 0,
  commission_total REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  total_pay REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'paid')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- Seed data
INSERT OR IGNORE INTO shifts (id, name, start_time, end_time, regular_hours) VALUES
  ('shift-morning', 'กะเช้า', '06:00', '14:00', 8),
  ('shift-afternoon', 'กะบ่าย', '14:00', '22:00', 8),
  ('shift-full', 'กะเต็มวัน', '08:00', '17:00', 8);

INSERT OR IGNORE INTO sales_points (id, name, location) VALUES
  ('sp-1', 'จุดขาย 1 - ตลาดเช้า', 'อาคาร A'),
  ('sp-2', 'จุดขาย 2 - ตลาดสาย', 'อาคาร A'),
  ('sp-3', 'จุดขาย 3 - ตลาดเย็น', 'อาคาร B'),
  ('sp-4', 'จุดขาย 4 - หน้าตลาด', 'อาคาร B'),
  ('sp-5', 'จุดขาย 5 - โซน C', 'อาคาร C'),
  ('sp-6', 'จุดขาย 6 - ออนไลน์', 'ออนไลน์');
