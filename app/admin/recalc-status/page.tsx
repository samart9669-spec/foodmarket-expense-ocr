'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getAuthHeaders } from '@/lib/utils'

interface Change {
  id: string
  employee_id: string
  employee_name: string | null
  department: string
  date: string
  check_in: string
  check_out: string
  shift_start: string
  grace_minutes: number
  late_minutes: number
  from_status: string
  to_status: string
  from_early_out: number
  to_early_out: number
  from_ot_hours: number
  to_ot_hours: number
  unknown_schedule: boolean
}

interface Preview {
  from: string
  to: string
  scanned: number
  skippedManual: number
  unknownSchedule: number
  changes: Change[]
}

const STATUS_LABELS: Record<string, string> = {
  present: 'ตรงเวลา',
  late: 'มาสาย',
  absent: 'ขาดงาน',
  half: 'ครึ่งวัน',
}

function label(s: string): string {
  return STATUS_LABELS[s] || s
}

function monthOptions(): string[] {
  const out: string[] = []
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export default function RecalcStatusPage() {
  const months = monthOptions()
  const [scope, setScope] = useState<'all' | 'month'>('all')
  const [month, setMonth] = useState(months[0])
  const [data, setData] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const qs = scope === 'month' ? `?month=${month}` : ''
    fetch(`/api/admin/recalc-status${qs}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => {
        if (d?.error) setToast({ msg: d.error, ok: false })
        else setData(d)
      })
      .catch(() => setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false }))
      .finally(() => setLoading(false))
  }, [scope, month])

  useEffect(() => { load() }, [load])

  const apply = async () => {
    if (!data || data.changes.length === 0) return
    if (!confirm(`ปรับสถานะย้อนหลัง ${data.changes.length} รายการ?`)) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/recalc-status', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(scope === 'month' ? { month } : {}),
      })
      const d = await res.json() as any
      if (res.ok) {
        setToast({
          msg: `ปรับแล้ว ${d.updated} รายการ (มาสาย ${d.to_late}, ตรงเวลา ${d.to_present}, ปรับ OT ${d.ot_fixed})`,
          ok: true,
        })
        load()
      } else {
        setToast({ msg: d.error || 'เกิดข้อผิดพลาด', ok: false })
      }
    } catch {
      setToast({ msg: 'เชื่อมต่อไม่สำเร็จ', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const changes = data?.changes || []
  const toLate = changes.filter(c => c.to_status === 'late').length
  const toPresent = changes.filter(c => c.to_status === 'present').length
  const otFixed = changes.filter(c => c.from_ot_hours !== c.to_ot_hours).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ล้าง/คำนวณสถานะย้อนหลัง</h1>
        <p className="text-sm text-gray-500 mt-1">
          คำนวณสถานะ &quot;มาสาย / ตรงเวลา&quot; ของรายการเข้างานที่บันทึกไว้แล้วใหม่
          ตามเวลาเข้ากะและจำนวนนาทีผ่อนผันของแต่ละแผนก
          พร้อมคำนวณชั่วโมง OT ใหม่จากเวลาเข้า-ออกเทียบกับช่วงกะ (ไม่หักเวลาพัก) นับทีละ 30 นาที ไม่ถึง 30 นาที ไม่นับ
          รายการที่เป็น ลา ขาดงาน หรือครึ่งวัน จะไม่ถูกแก้ไข
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={scope}
          onChange={e => setScope(e.target.value as 'all' | 'month')}
        >
          <option value="all">ทั้งหมดที่ผ่านมา</option>
          <option value="month">เลือกเดือน</option>
        </select>
        {scope === 'month' && (
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={month}
            onChange={e => setMonth(e.target.value)}
          >
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <button
          onClick={load}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          ตรวจสอบใหม่
        </button>
        <button
          onClick={apply}
          disabled={saving || loading || changes.length === 0}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'กำลังปรับ...' : `ปรับสถานะ ${changes.length} รายการ`}
        </button>
        <Link href="/reports/attendance" className="text-sm text-blue-600 hover:underline ml-auto">
          ไปหน้าสถิติขาด ลา มาสาย →
        </Link>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-3 text-sm ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'ตรวจสอบทั้งหมด', value: data.scanned },
            { label: 'ต้องแก้ไข', value: changes.length },
            { label: 'เปลี่ยนเป็นมาสาย', value: toLate },
            { label: 'เปลี่ยนเป็นตรงเวลา', value: toPresent },
            { label: 'ปรับชั่วโมง OT', value: otFixed },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className="text-xl font-bold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && data.unknownSchedule > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
          มี {data.unknownSchedule} รายการที่ไม่พบกะทำงาน จึงไม่สามารถตัดสินว่าสายได้
          กรุณาตั้ง &quot;กะหลัก&quot; ให้แต่ละสาขาที่หน้า <Link href="/branches" className="underline font-medium">จัดการสาขา</Link>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">กำลังตรวจสอบ...</div>
        ) : changes.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">สถานะทุกรายการถูกต้องแล้ว</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="px-3 py-3 text-left">วันที่</th>
                  <th className="px-3 py-3 text-left">พนักงาน</th>
                  <th className="px-3 py-3 text-left">แผนก</th>
                  <th className="px-3 py-3 text-center">เข้ากะ</th>
                  <th className="px-3 py-3 text-center">เช็คอิน</th>
                  <th className="px-3 py-3 text-center">ผ่อนผัน</th>
                  <th className="px-3 py-3 text-center">สาย (นาที)</th>
                  <th className="px-3 py-3 text-center">เดิม</th>
                  <th className="px-3 py-3 text-center">ใหม่</th>
                  <th className="px-3 py-3 text-center">OT (ชม.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {changes.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{c.date}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{c.employee_name || c.employee_id}</td>
                    <td className="px-3 py-2 text-gray-500">{c.department}</td>
                    <td className="px-3 py-2 text-center">{c.shift_start}</td>
                    <td className="px-3 py-2 text-center">{c.check_in}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{c.grace_minutes}น.</td>
                    <td className="px-3 py-2 text-center">{c.late_minutes > 0 ? `${c.late_minutes}` : '-'}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{label(c.from_status)}</td>
                    <td className={`px-3 py-2 text-center font-semibold ${c.to_status === 'late' ? 'text-orange-600' : 'text-green-600'}`}>
                      {label(c.to_status)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.from_ot_hours !== c.to_ot_hours
                        ? <span className="text-blue-600 font-medium">{c.from_ot_hours} → {c.to_ot_hours}</span>
                        : <span className="text-gray-400">{c.to_ot_hours}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
