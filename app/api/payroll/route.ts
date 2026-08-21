import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getBangkokDateTimeString } from '@/lib/utils'
import { verifySession, SessionUser } from '@/lib/admin-auth'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Payroll belongs to the admin account that created it: each login works with
// its own list. Records made before this existed have no owner and stay
// visible to everyone so nothing silently disappears.
async function ensureCreatedByColumn(db: any) {
  try {
    await db.prepare('ALTER TABLE payroll ADD COLUMN created_by TEXT').run()
  } catch {
    // duplicate column — already present
  }
}

async function currentUser(request: NextRequest, db: any): Promise<SessionUser | null> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return verifySession(db, auth.slice(7))
}

/** Own records, unowned legacy records, or anything when superadmin. */
function canManage(user: SessionUser, record: { created_by?: string | null }): boolean {
  if (user.role === 'superadmin') return true
  return !record.created_by || record.created_by === user.username
}

/** Superadmins may look at everyone's records by asking for it. */
function wantsAll(request: NextRequest, user: SessionUser): boolean {
  const { searchParams } = new URL(request.url)
  return user.role === 'superadmin' && searchParams.get('all') === '1'
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await currentUser(request, db)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureCreatedByColumn(db)

    const { searchParams } = new URL(request.url)
    const employee_id = searchParams.get('employee_id')
    const status = searchParams.get('status')

    let query = `
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE 1=1
    `
    const params: string[] = []
    if (!wantsAll(request, user)) {
      query += ' AND (p.created_by = ? OR p.created_by IS NULL)'
      params.push(user.username)
    }
    if (employee_id) { query += ' AND p.employee_id = ?'; params.push(employee_id) }
    if (status) { query += ' AND p.status = ?'; params.push(status) }
    query += ' ORDER BY p.created_at DESC'

    const result = await db.prepare(query).bind(...params).all()
    return Response.json({ payroll: result.results, username: user.username, role: user.role })
  } catch (error) {
    console.error('GET /api/payroll error:', error)
    return Response.json({ error: 'Failed to fetch payroll' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string; period_start: string; period_end: string;
      days_worked?: number; day_rate_total?: number; ot_hours_total?: number;
      ot_total?: number; sales_total?: number; commission_total?: number;
      bonus?: number; deductions?: number; total_pay?: number; status?: string; notes?: string
    }

    const user = await currentUser(request, db)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureCreatedByColumn(db)

    const { employee_id, period_start, period_end, days_worked = 0, day_rate_total = 0,
      ot_hours_total = 0, ot_total = 0, sales_total = 0, commission_total = 0,
      bonus = 0, deductions = 0, total_pay = 0, status = 'pending', notes } = body

    if (!employee_id || !period_start || !period_end) {
      return Response.json({ error: 'employee_id, period_start, and period_end are required' }, { status: 400 })
    }

    const employee = await db.prepare('SELECT id FROM employees WHERE id = ?').bind(employee_id).first()
    if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 })

    const id = generateId()
    await db.prepare(`
      INSERT INTO payroll (id, employee_id, period_start, period_end, days_worked,
        day_rate_total, ot_hours_total, ot_total, sales_total, commission_total,
        bonus, deductions, total_pay, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, employee_id, period_start, period_end, days_worked, day_rate_total,
      ot_hours_total, ot_total, sales_total, commission_total,
      bonus, deductions, total_pay, status, notes || null, user.username).run()

    const payroll = await db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.id = ?
    `).bind(id).first()

    return Response.json({ payroll }, { status: 201 })
  } catch (error) {
    console.error('POST /api/payroll error:', error)
    return Response.json({ error: 'Failed to create payroll record' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const body = await request.json() as {
      id: string; status?: string; notes?: string
      days_worked?: number; day_rate_total?: number
      ot_hours_total?: number; ot_total?: number
      sales_total?: number; commission_total?: number
      bonus?: number; deductions?: number; total_pay?: number
      edited_by?: string
    }
    const {
      id, status, notes, days_worked, day_rate_total, ot_hours_total, ot_total,
      sales_total, commission_total, bonus, deductions, total_pay, edited_by,
    } = body

    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const user = await currentUser(request, db)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureCreatedByColumn(db)

    const existing = await db.prepare('SELECT * FROM payroll WHERE id = ?').bind(id).first() as any
    if (!existing) return Response.json({ error: 'Payroll record not found' }, { status: 404 })
    if (!canManage(user, existing)) {
      return Response.json({ error: 'รายการนี้เป็นของผู้ใช้อื่น' }, { status: 403 })
    }

    // Any change to the amounts is a correction — keep the first computed total
    // and stamp who changed it so payroll stays auditable.
    const isAmountEdit = [
      days_worked, day_rate_total, ot_hours_total, ot_total,
      sales_total, commission_total, bonus, deductions, total_pay,
    ].some(v => v !== undefined)

    try {
      await db.prepare('ALTER TABLE payroll ADD COLUMN original_total_pay REAL').run()
    } catch {}
    try {
      await db.prepare('ALTER TABLE payroll ADD COLUMN edited_at TEXT').run()
    } catch {}
    try {
      await db.prepare('ALTER TABLE payroll ADD COLUMN edited_by TEXT').run()
    } catch {}

    const originalTotal = existing.original_total_pay ?? (isAmountEdit ? existing.total_pay : null)
    const editedAt = isAmountEdit ? getBangkokDateTimeString() : (existing.edited_at ?? null)
    const editedBy = isAmountEdit ? (edited_by || user.display_name || user.username) : (existing.edited_by ?? null)

    await db.prepare(`
      UPDATE payroll SET
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        days_worked = COALESCE(?, days_worked),
        day_rate_total = COALESCE(?, day_rate_total),
        ot_hours_total = COALESCE(?, ot_hours_total),
        ot_total = COALESCE(?, ot_total),
        sales_total = COALESCE(?, sales_total),
        commission_total = COALESCE(?, commission_total),
        bonus = COALESCE(?, bonus),
        deductions = COALESCE(?, deductions),
        total_pay = COALESCE(?, total_pay),
        original_total_pay = ?,
        edited_at = ?,
        edited_by = ?
      WHERE id = ?
    `).bind(
      status ?? null, notes ?? null,
      days_worked ?? null, day_rate_total ?? null,
      ot_hours_total ?? null, ot_total ?? null,
      sales_total ?? null, commission_total ?? null,
      bonus ?? null, deductions ?? null, total_pay ?? null,
      originalTotal, editedAt, editedBy,
      id,
    ).run()

    const updated = await db.prepare(`
      SELECT p.*, e.name as employee_name, e.employee_type
      FROM payroll p LEFT JOIN employees e ON p.employee_id = e.id WHERE p.id = ?
    `).bind(id).first()

    return Response.json({ payroll: updated })
  } catch (error) {
    console.error('PATCH /api/payroll error:', error)
    return Response.json({ error: 'Failed to update payroll record' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await currentUser(request, db)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ensureCreatedByColumn(db)

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'ต้องระบุ id ของรายการ' }, { status: 400 })

    const existing = await db.prepare('SELECT id, created_by FROM payroll WHERE id = ?').bind(id).first() as any
    if (!existing) return Response.json({ error: 'ไม่พบรายการเงินเดือนนี้' }, { status: 404 })
    if (!canManage(user, existing)) {
      return Response.json({ error: 'รายการนี้เป็นของผู้ใช้อื่น' }, { status: 403 })
    }

    await db.prepare('DELETE FROM payroll WHERE id = ?').bind(id).run()
    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/payroll error:', error)
    return Response.json({ error: 'ลบรายการไม่สำเร็จ' }, { status: 500 })
  }
}
