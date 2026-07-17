INSERT OR IGNORE INTO employees (id, name, employee_type, sales_point_id, daily_rate, ot_rate, qr_code) VALUES
  ('emp-1', 'นายสมชาย ใจดี', 'kitchen', 'sp-1', 400, 60, 'EMP-0021'),
  ('emp-2', 'นส.เอมี่ สวยงาม', 'sales', 'sp-2', 350, 50, 'EMP-0105'),
  ('emp-3', 'นายมานพ ขยันยิ่ง', 'sales', 'sp-3', 350, 50, 'EMP-0112');
INSERT OR IGNORE INTO attendance (id, employee_id, date, shift_id, check_in, check_out, sales_point_id, status, ot_hours) VALUES
  ('att-1', 'emp-1', date('now','localtime'), 'shift-morning', datetime('now','localtime','-6 hours'), datetime('now','localtime','-1 hours'), 'sp-1', 'present', 1),
  ('att-2', 'emp-2', date('now','localtime'), 'shift-full', datetime('now','localtime','-4 hours'), NULL, 'sp-3', 'present', 0),
  ('att-3', 'emp-3', date('now','localtime'), 'shift-afternoon', datetime('now','localtime','-2 hours'), NULL, 'sp-3', 'late', 0);
