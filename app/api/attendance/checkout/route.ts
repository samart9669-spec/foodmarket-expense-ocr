import { getRequestContext } from '@cloudflare/next-on-pages'
import { getTodayString, calculateHoursWorked, calculateOTHours } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      method: 'face' | 'qr' | 'manual'
    }

    const { employee_id, method = 'manual' } = body

    if (!employee_id) {
      return Response.json({ error: 'employee_id is required' }, { status: 400 })
    }

    const employee = await db
      .prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id)
      .first() as { id: string; name: string; employee_type: string } | null

    if (!employee) {
      return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })
    }

    const today = getTodayString()
    const existing = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employee_id, today)
      .first() as {
        id: string
        check_in: string | null
        check_out: string | null
        status: string
      } | null

    if (!existing) {
      return Response.json({ error: 'ยังไม่ได้เช็คอินวันนี้' }, { status: 400 })
    }

    if (!existing.check_in) {
      return Response.json({ error: 'ยังไม่ได้เช็คอิน' }, { status: 400 })
    }

    if (existing.check_out) {
      return Response.json({ error: 'เช็คเอาต์ไปแล้ววันนี้', check_out: existing.check_out }, { status: 409 })
    }

    const now = new Date()
    const checkOutTime = `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    const totalHours = calculateHoursWorked(existing.check_in, checkOutTime)
    const regularHours = Math.min(totalHours, 8)
    const otHours = calculateOTHours(totalHours)

    await db
      .prepare(`
        UPDATE attendance
        SET check_out = ?, check_out_method = ?, regular_hours = ?, ot_hours = ?
        WHERE id = ?
      `)
      .bind(checkOutTime, method, regularHours, otHours, existing.id)
      .run()

    const updated = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(existing.id).first()

    return Response.json({
      success: true,
      message: `เช็คเอาต์สำเร็จ: ${employee.name}`,
      employee_name: employee.name,
      employee_type: employee.employee_type,
      check_out: checkOutTime,
      total_hours: Math.round(totalHours * 100) / 100,
      regular_hours: Math.round(regularHours * 100) / 100,
      ot_hours: Math.round(otHours * 100) / 100,
      attendance: updated,
    })
  } catch (error) {
    console.error('POST /api/attendance/checkout error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
