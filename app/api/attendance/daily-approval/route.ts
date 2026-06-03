import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { env } = getRequestContext()
  const db = env.DB
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  try {
    const [empResult, attResult, settingsResult, shiftsResult] = await Promise.all([
      db.prepare(`
        SELECT e.id, e.name, e.daily_rate, e.employee_type,
               s.id as shift_id, s.name as shift_name,
               s.start_time as shift_start, s.end_time as shift_end,
               s.regular_hours, s.break_minutes
        FROM employees e
        LEFT JOIN shifts s ON s.id = (
          SELECT a2.shift_id FROM attendance a2
          WHERE a2.employee_id = e.id AND a2.date = ? LIMIT 1
        )
        WHERE e.is_active = 1
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

    for (const rec of records) {
      if (!rec.check_in && !rec.check_out) continue

      if (rec.attendance_id) {
        await db.prepare(`
          UPDATE attendance SET
            check_in = ?, check_out = ?,
            day_type = ?, regular_hours = ?, ot_hours = ?,
            food_allowance = ?, split_shift_allowance = ?,
            cash_advance = ?, net_pay = ?,
            status = ?, notes = ?, approved = ?
          WHERE id = ?
        `).bind(
          rec.check_in, rec.check_out,
          rec.day_type, rec.regular_hours, rec.ot_hours,
          rec.food_allowance, rec.split_shift_allowance,
          rec.cash_advance, rec.net_pay,
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
          rec.day_type, rec.regular_hours, rec.ot_hours,
          rec.food_allowance, rec.split_shift_allowance,
          rec.cash_advance, rec.net_pay,
          rec.status, rec.notes, approved,
        ).run()
      }
    }

    return Response.json({ ok: true, action, saved: records.length })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
