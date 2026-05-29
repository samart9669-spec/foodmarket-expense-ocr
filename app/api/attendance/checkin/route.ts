import { getRequestContext } from '@cloudflare/next-on-pages'
import { generateId, getTodayString } from '@/lib/utils'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB

    const body = await request.json() as {
      employee_id: string
      method: 'face' | 'qr' | 'manual'
      sales_point_id?: string
      shift_id?: string
    }

    const { employee_id, method = 'manual', sales_point_id, shift_id } = body

    if (!employee_id) {
      return Response.json({ error: 'employee_id is required' }, { status: 400 })
    }

    const employee = await db
      .prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1')
      .bind(employee_id)
      .first()

    if (!employee) {
      return Response.json({ error: 'ไม่พบข้อมูลพนักงาน' }, { status: 404 })
    }

    const today = getTodayString()
    const now = new Date()
    const checkInTime = `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`

    const existing = await db
      .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
      .bind(employee_id, today)
      .first() as { id: string; check_in: string | null; check_out: string | null } | null

    if (existing) {
      if (existing.check_in) {
        return Response.json({
          error: 'เช็คอินไปแล้ววันนี้',
          check_in: existing.check_in,
        }, { status: 409 })
      }
      await db
        .prepare(`UPDATE attendance SET check_in = ?, check_in_method = ? WHERE id = ?`)
        .bind(checkInTime, method, existing.id)
        .run()

      const updated = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(existing.id).first()
      return Response.json({
        success: true,
        message: `เช็คอินสำเร็จ: ${(employee as { name: string }).name}`,
        employee_name: (employee as { name: string }).name,
        employee_type: (employee as { employee_type: string }).employee_type,
        check_in: checkInTime,
        attendance: updated,
      })
    }

    let status = 'present'
    if (shift_id) {
      const shift = await db.prepare('SELECT * FROM shifts WHERE id = ?').bind(shift_id).first() as { start_time: string; regular_hours: number } | null
      if (shift) {
        const [shiftHour, shiftMin] = shift.start_time.split(':').map(Number)
        const graceMinutes = 15
        const lateThreshold = shiftHour * 60 + shiftMin + graceMinutes
        const currentMinutes = now.getHours() * 60 + now.getMinutes()
        if (currentMinutes > lateThreshold) {
          status = 'late'
        }
      }
    }

    const id = generateId()
    await db
      .prepare(`
        INSERT INTO attendance (id, employee_id, date, shift_id, check_in, check_in_method, sales_point_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(id, employee_id, today, shift_id || null, checkInTime, method, sales_point_id || null, status)
      .run()

    const attendance = await db.prepare('SELECT * FROM attendance WHERE id = ?').bind(id).first()

    return Response.json({
      success: true,
      message: `เช็คอินสำเร็จ: ${(employee as { name: string }).name}`,
      employee_name: (employee as { name: string }).name,
      employee_type: (employee as { employee_type: string }).employee_type,
      check_in: checkInTime,
      status,
      attendance,
    })
  } catch (error) {
    console.error('POST /api/attendance/checkin error:', error)
    return Response.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
