import { getRequestContext } from '@cloudflare/next-on-pages'
import { verifySession } from '@/lib/admin-auth'
import { departmentOfEmployee } from '@/lib/diligence'
import { roundOTToHalfHour, isOTEligible } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// Roles allowed to review and approve daily working time. 'approver' accounts
// can reach this endpoint and nothing else.
const APPROVAL_ROLES = ['superadmin', 'admin', 'manager', 'approver']

async function authorizeApproval(request: NextRequest, db: any): Promise<boolean> {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const user = await verifySession(db, auth.slice(7))
  return !!user && APPROVAL_ROLES.includes(user.role)
}

export async function GET(request: NextRequest) {
  const { env } = getRequestContext()
  const db = env.DB
  if (!(await authorizeApproval(request, db))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  try {
    const [empResult, attResult, settingsResult, shiftsResult] = await Promise.all([
      db.prepare(`
        SELECT e.id, e.name, e.daily_rate, e.ot_rate, e.employee_type, e.salary_type, e.job_title,
               s.id as shift_id, s.name as shift_name,
               s.start_time as shift_start, s.end_time as shift_end,
               s.regular_hours, s.break_minutes
        FROM employees e
        LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
        -- Branch worked that day, otherwise the employee's own branch
        LEFT JOIN sales_points sp ON sp.id = COALESCE(a.sales_point_id, e.sales_point_id)
        -- Shift saved for the day wins; otherwise the branch's default shift
        LEFT JOIN shifts s ON s.id = COALESCE(a.shift_id, sp.default_shift_id)
        WHERE e.is_active = 1
          AND (e.job_title IS NULL OR e.job_title IN ('', 'kitchen', 'sales'))
        ORDER BY e.name ASC
      `).bind(date).all(),

      db.prepare(`
        SELECT * FROM attendance WHERE date = ?
      `).bind(date).all(),

      db.prepare('SELECT key, value FROM payroll_settings').all(),

      db.prepare('SELECT * FROM shifts ORDER BY start_time').all(),
    ])

    const settings: Record<string, string> = {}
    for (const row of (settingsResult.results as any[])) {
      settings[row.key] = row.value
    }

    const attMap: Record<string, any> = {}
    for (const row of (attResult.results as any[])) {
      attMap[row.employee_id] = row
    }

    const employees = (empResult.results as any[]).map(emp => ({
      ...emp,
      department: departmentOfEmployee(emp),
      attendance: attMap[emp.id] || null,
    }))

    return Response.json({
      date,
      employees,
      settings,
      shifts: shiftsResult.results,
    })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { env } = getRequestContext()
  const db = env.DB

  if (!(await authorizeApproval(request, db))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { date, records, action } = await request.json() as {
      date: string
      action: 'draft' | 'approve'
      records: Array<{
        employee_id: string
        attendance_id: string | null
        shift_id: string | null
        check_in: string | null
        check_out: string | null
        day_type: string
        regular_hours: number
        ot_hours: number
        food_allowance: number
        split_shift_allowance: number
        cash_advance: number
        net_pay: number
        notes: string
        status: string
      }>
    }

    const approved = action === 'approve' ? 1 : 0

    // Salary type decides OT eligibility — looked up once for the whole save
    const empRes = await db.prepare('SELECT id, salary_type FROM employees').all()
    const salaryTypes: Record<string, string> = {}
    for (const e of (empRes.results || []) as any[]) salaryTypes[e.id] = e.salary_type || 'daily'

    for (const rec of records) {
      if (!rec.check_in && !rec.check_out) continue

      // OT is stored in whole 30-minute blocks for daily-rate staff only,
      // so a hand-typed value can never reintroduce per-minute OT.
      const otHours = isOTEligible(salaryTypes[rec.employee_id])
        ? roundOTToHalfHour(Number(rec.ot_hours) || 0)
        : 0

      // Wages are paid in whole baht — never store satang
      const netPay = Math.round(Number(rec.net_pay) || 0)

      if (rec.attendance_id) {
        await db.prepare(`
          UPDATE attendance SET
            shift_id = ?,
            check_in = ?, check_out = ?,
            day_type = ?, regular_hours = ?, ot_hours = ?,
            food_allowance = ?, split_shift_allowance = ?,
            cash_advance = ?, net_pay = ?,
            status = ?, notes = ?, approved = ?
          WHERE id = ?
        `).bind(
          rec.shift_id,
          rec.check_in, rec.check_out,
          rec.day_type, rec.regular_hours, otHours,
          rec.food_allowance, rec.split_shift_allowance,
          rec.cash_advance, netPay,
          rec.status, rec.notes, approved,
          rec.attendance_id,
        ).run()
      } else {
        const id = `att-${rec.employee_id}-${date}-${Date.now()}`
        await db.prepare(`
          INSERT INTO attendance (
            id, employee_id, date, shift_id, check_in, check_out,
            day_type, regular_hours, ot_hours,
            food_allowance, split_shift_allowance, cash_advance, net_pay,
            status, notes, approved, check_in_method
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
        `).bind(
          id, rec.employee_id, date, rec.shift_id,
          rec.check_in, rec.check_out,
          rec.day_type, rec.regular_hours, otHours,
          rec.food_allowance, rec.split_shift_allowance,
          rec.cash_advance, netPay,
          rec.status, rec.notes, approved,
        ).run()
      }
    }

    return Response.json({ ok: true, action, saved: records.length })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
