'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthHeaders, roundOTToHalfHour, isOTEligible, lateMinutes, scheduledWorkHours } from '@/lib/utils'

interface ShiftInfo {
  id: string; name: string; start_time: string; end_time: string
  regular_hours: number; break_minutes: number
}

interface AttendanceRow {
  id: string | null
  employee_id: string
  name: string
  daily_rate: number
  ot_rate: number
  salary_type: string
  department: string
  shift_id: string | null
  shift_name: string | null
  shift_start: string | null
  shift_end: string | null
  regular_hours_shift: number
  break_minutes: number
  // editable fields
  check_in: string
  check_out: string
  day_type: string
  food_allowance: number
  split_shift_allowance: number
  cash_advance: number
  notes: string
  approved: boolean
  // computed
  actual_hours: number
  late_minutes: number
  ot_hours: number
  net_pay: number
  status: string
}

const DAY_TYPES = [
  { value: 'normal', label: 'วันทำงานปกติ', multiplier_key: '' },
  { value: 'weekend', label: 'วันหยุดสุดสัปดาห์', multiplier_key: 'weekend_wage_multiplier' },
  { value: 'holiday', label: 'วันหยุดนักขัตฤกษ์', multiplier_key: 'holiday_wage_multiplier' },
]

// Attendance timestamps are stored as Bangkok wall-clock strings — no conversion
function storedToHHMM(str: string | null): string {
  if (!str) return ''
  const m = str.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : ''
}

function hhmmToStored(dateStr: string, hhmm: string): string {
  if (!hhmm) return ''
  return `${dateStr} ${hhmm}:00`
}

function calcMinutesDiff(fromHHMM: string, toHHMM: string): number {
  if (!fromHHMM || !toHHMM) return 0
  const [fh, fm] = fromHHMM.split(':').map(Number)
  const [th, tm] = toHHMM.split(':').map(Number)
  let diff = (th * 60 + tm) - (fh * 60 + fm)
  if (diff < 0) diff += 24 * 60
  return diff
}

function computeRow(row: AttendanceRow, settings: Record<string, string>): AttendanceRow {
  // The daily wage buys the whole shift, not a number of worked hours, so the
  // break is part of the shift and is never deducted from the time worked.
  const workMins = calcMinutesDiff(row.check_in, row.check_out)
  const actual_hours = workMins > 0 ? workMins / 60 : 0

  // Late only when the check-in is past the shift start plus the department's
  // grace — arriving early is never late.
  const grace = parseInt(settings[`late_grace_${row.department}`] ?? '15') || 0
  const lateMins = row.shift_start && row.check_in
    ? lateMinutes(row.shift_start, row.check_in, grace)
    : 0
  // OT starts once the shift's own hours are past — derived from the shift
  // times so it stays right even when the stored regular_hours disagrees.
  const regularHours = scheduledWorkHours(
    row.shift_start, row.shift_end, row.regular_hours_shift || 8,
  )
  // OT: daily-rate staff only, counted in whole 30-minute blocks
  const ot_hours = isOTEligible(row.salary_type)
    ? roundOTToHalfHour(Math.max(0, actual_hours - regularHours))
    : 0

  const dayTypeObj = DAY_TYPES.find(d => d.value === row.day_type)
  let multiplier = 1
  if (dayTypeObj?.multiplier_key) {
    multiplier = parseFloat(settings[dayTypeObj.multiplier_key] || '1') || 1
  }

  const otMultiplierKey = row.day_type === 'holiday'
    ? 'ot_multiplier_holiday'
    : row.day_type === 'weekend'
    ? 'ot_multiplier_weekend'
    : 'ot_multiplier_weekday'
  const otMultiplier = parseFloat(settings[otMultiplierKey] || '1.5') || 1.5
  // The employee's configured OT rate wins — that is what the payroll run uses,
  // so both screens show the same money. Only when it is unset is the rate
  // derived from the daily wage and multiplied by the day-type factor.
  const otPayPerHour = row.ot_rate > 0
    ? row.ot_rate
    : (row.daily_rate / (regularHours || 8)) * otMultiplier

  const base = row.daily_rate * multiplier
  // Wages are paid in whole baht — a half-hour OT block must not leave satang
  const otPay = Math.round(ot_hours * otPayPerHour)
  const net_pay = Math.max(0, Math.round(
    base + otPay + row.food_allowance + row.split_shift_allowance - row.cash_advance
  ))

  const status = !row.check_in ? 'absent'
    : lateMins > 0 ? 'late'
    : 'present'

  return { ...row, actual_hours, late_minutes: lateMins, ot_hours, net_pay, status }
}

export default function DailyApprovalPage() {
  const router = useRouter()
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' })
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [shifts, setShifts] = useState<ShiftInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async (d: string) => {
    setLoading(true)
    setSavedMsg('')
    try {
      const res = await fetch(`/api/attendance/daily-approval?date=${d}`, { headers: getAuthHeaders() })
      const data = await res.json() as any
      const s: Record<string, string> = data.settings || {}
      setSettings(s)
      setShifts(data.shifts || [])
      const defaultShift = (data.shifts || [])[0] as ShiftInfo | undefined

      const mapped: AttendanceRow[] = (data.employees || []).map((emp: any) => {
        const att = emp.attendance
        const shiftStart = emp.shift_start || defaultShift?.start_time || '08:00'
        const shiftEnd = emp.shift_end || defaultShift?.end_time || '17:00'
        const breakMins = emp.break_minutes ?? defaultShift?.break_minutes ?? 60
        const raw: AttendanceRow = {
          id: att?.id || null,
          employee_id: emp.id,
          name: emp.name,
          daily_rate: emp.daily_rate || 0,
          ot_rate: emp.ot_rate || 0,
          salary_type: emp.salary_type || 'daily',
          department: emp.department || 'kitchen',
          shift_id: emp.shift_id || defaultShift?.id || null,
          shift_name: emp.shift_name || defaultShift?.name || '',
          shift_start: shiftStart,
          shift_end: shiftEnd,
          regular_hours_shift: emp.regular_hours || defaultShift?.regular_hours || 8,
          break_minutes: breakMins,
          check_in: att ? storedToHHMM(att.check_in) : '',
          check_out: att ? storedToHHMM(att.check_out) : '',
          day_type: att?.day_type || 'normal',
          food_allowance: att?.food_allowance ?? parseFloat(s.allowance_food || '0'),
          split_shift_allowance: att?.split_shift_allowance ?? parseFloat(s.allowance_split_shift || '0'),
          cash_advance: att?.cash_advance ?? 0,
          notes: att?.notes || '',
          approved: !!att?.approved,
          actual_hours: 0,
          late_minutes: 0,
          ot_hours: 0,
          net_pay: 0,
          status: 'absent',
        }
        return computeRow(raw, s)
      })
      setRows(mapped)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(date) }, [date, load])

  const update = (idx: number, patch: Partial<AttendanceRow>) => {
    setRows(prev => {
      const next = [...prev]
      const merged = { ...next[idx], ...patch }
      next[idx] = computeRow(merged, settings)
      return next
    })
  }

  const handleShiftChange = (idx: number, shiftId: string) => {
    const sh = shifts.find(s => s.id === shiftId)
    if (!sh) return
    update(idx, {
      shift_id: sh.id,
      shift_name: sh.name,
      shift_start: sh.start_time,
      shift_end: sh.end_time,
      regular_hours_shift: sh.regular_hours,
      break_minutes: sh.break_minutes ?? 60,
    })
  }

  const handleSave = async (action: 'draft' | 'approve') => {
    setSaving(true)
    setSavedMsg('')
    try {
      const records = rows
        .filter(r => r.check_in || r.check_out)
        .map(r => ({
          employee_id: r.employee_id,
          attendance_id: r.id,
          shift_id: r.shift_id,
          check_in: r.check_in ? hhmmToStored(date, r.check_in) : null,
          check_out: r.check_out ? hhmmToStored(date, r.check_out) : null,
          day_type: r.day_type,
          regular_hours: parseFloat(r.actual_hours.toFixed(2)),
          ot_hours: parseFloat(r.ot_hours.toFixed(2)),
          food_allowance: r.food_allowance,
          split_shift_allowance: r.split_shift_allowance,
          cash_advance: r.cash_advance,
          net_pay: Math.round(r.net_pay),
          notes: r.notes,
          status: r.status,
        }))

      const res = await fetch('/api/attendance/daily-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ date, records, action }),
      })
      const data = await res.json() as any
      if (!res.ok) { alert(data.error || 'เกิดข้อผิดพลาด'); return }

      if (action === 'approve') setRows(prev => prev.map(r => ({ ...r, approved: r.check_in ? true : r.approved })))
      setSavedMsg(action === 'approve' ? 'อนุมัติสำเร็จแล้ว' : 'บันทึกร่างสำเร็จ')
      await load(date)
    } finally {
      setSaving(false)
    }
  }

  const filtered = rows.filter(r => {
    if (statusFilter === 'present') return r.check_in && r.status !== 'absent'
    if (statusFilter === 'absent') return !r.check_in
    if (statusFilter === 'late') return r.status === 'late'
    if (statusFilter === 'approved') return r.approved
    return true
  })

  const summary = {
    present: rows.filter(r => r.check_in).length,
    absent: rows.filter(r => !r.check_in).length,
    late: rows.filter(r => r.status === 'late').length,
    totalBase: rows.reduce((s, r) => s + (r.check_in ? r.daily_rate : 0), 0),
    totalAllowance: rows.reduce((s, r) => s + r.food_allowance + r.split_shift_allowance, 0),
    totalDeduction: rows.reduce((s, r) => s + r.cash_advance, 0),
    totalNet: rows.reduce((s, r) => s + r.net_pay, 0),
  }

  // Every amount on this sheet is whole baht — show it that way
  const fmt = (n: number) => Math.round(n).toLocaleString('th-TH')

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/attendance')} className="text-gray-400 hover:text-gray-600 transition-colors group">
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">อนุมัติเวลางานรายวัน</h1>
            <p className="text-gray-500 text-sm mt-0.5">Daily Staff Timesheet Approval</p>
          </div>
        </div>
        {savedMsg && (
          <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
            ✓ {savedMsg}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">วันที่</label>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">สถานะ</label>
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="all">ทั้งหมด ({rows.length})</option>
            <option value="present">มางาน ({summary.present})</option>
            <option value="absent">ขาดงาน ({summary.absent})</option>
            <option value="late">มาสาย ({summary.late})</option>
            <option value="approved">อนุมัติแล้ว ({rows.filter(r => r.approved).length})</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'พนักงานทั้งหมด', value: rows.length + ' คน', color: 'bg-blue-50 text-blue-800 border-blue-200' },
          { label: 'มางาน', value: summary.present + ' คน', color: 'bg-green-50 text-green-800 border-green-200' },
          { label: 'ขาดงาน', value: summary.absent + ' คน', color: 'bg-red-50 text-red-800 border-red-200' },
          { label: 'มาสาย', value: summary.late + ' คน', color: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
          { label: 'ค่าแรงรวม', value: '฿' + fmt(summary.totalBase), color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
          { label: 'เบี้ยเลี้ยงรวม', value: '฿' + fmt(summary.totalAllowance), color: 'bg-purple-50 text-purple-800 border-purple-200' },
          { label: 'ยอดสุทธิรวม', value: '฿' + fmt(summary.totalNet), color: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border px-3 py-2.5 text-center ${c.color}`}>
            <p className="text-xs opacity-70">{c.label}</p>
            <p className="text-sm font-semibold mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1200px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3 text-left w-20">รหัส</th>
                  <th className="px-3 py-3 text-left">ชื่อพนักงาน</th>
                  <th className="px-3 py-3 text-left w-36">กะงาน</th>
                  <th className="px-3 py-3 text-center w-24">เข้าจริง</th>
                  <th className="px-3 py-3 text-center w-24">ออกจริง</th>
                  <th className="px-3 py-3 text-center w-20">ชม.จริง</th>
                  <th className="px-3 py-3 text-center w-16">OT<br/><span className="text-gray-400 normal-case font-normal">(ชม.)</span></th>
                  <th className="px-3 py-3 text-center w-16">สาย</th>
                  <th className="px-3 py-3 text-left w-36">สถานะวัน</th>
                  <th className="px-3 py-3 text-center w-20">ค่าอาหาร<br/><span className="text-gray-400 normal-case font-normal">(฿)</span></th>
                  <th className="px-3 py-3 text-center w-20">เบี้ยชัน<br/><span className="text-gray-400 normal-case font-normal">(฿)</span></th>
                  <th className="px-3 py-3 text-center w-24">หักล่วงหน้า<br/><span className="text-gray-400 normal-case font-normal">(฿)</span></th>
                  <th className="px-3 py-3 text-center w-24 text-blue-700">ยอดสุทธิ<br/><span className="text-gray-400 normal-case font-normal">(฿)</span></th>
                  <th className="px-3 py-3 text-left w-36">หมายเหตุ</th>
                  <th className="px-3 py-3 text-center w-16">อนุมัติ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row, idx) => {
                  const realIdx = rows.indexOf(row)
                  const isAbsent = !row.check_in
                  return (
                    <tr key={row.employee_id}
                      className={`transition-colors ${row.approved ? 'bg-green-50' : isAbsent ? 'bg-red-50 opacity-60' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2 text-xs text-gray-500 font-mono">{row.employee_id.slice(0, 8)}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 py-2">
                        <select
                          value={row.shift_id || ''}
                          onChange={e => handleShiftChange(realIdx, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="time" value={row.check_in}
                          onChange={e => update(realIdx, { check_in: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="time" value={row.check_out}
                          onChange={e => update(realIdx, { check_out: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-mono text-sm">{row.actual_hours > 0 ? row.actual_hours.toFixed(2) : '-'}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {/* OT is counted in whole 30-minute blocks */}
                        {row.ot_hours > 0
                          ? <span className="font-mono text-sm text-indigo-600 font-medium">{row.ot_hours.toFixed(1)}</span>
                          : <span className="text-gray-300 text-xs">0</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.late_minutes > 0
                          ? <span className="text-orange-600 font-medium text-xs">{row.late_minutes}น.</span>
                          : <span className="text-gray-300 text-xs">0</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.day_type}
                          onChange={e => update(realIdx, { day_type: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          {DAY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={row.food_allowance} min={0} step="any"
                          onChange={e => update(realIdx, { food_allowance: Number(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={row.split_shift_allowance} min={0} step="any"
                          onChange={e => update(realIdx, { split_shift_allowance: Number(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={row.cash_advance} min={0} step="any"
                          onChange={e => update(realIdx, { cash_advance: Number(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-red-300"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-bold text-sm ${row.net_pay > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                          {row.net_pay > 0 ? fmt(row.net_pay) : '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={row.notes} placeholder="หมายเหตุ..."
                          onChange={e => update(realIdx, { notes: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.approved
                          ? <span className="text-green-600 text-lg">✓</span>
                          : <span className="text-gray-300 text-lg">[ ]</span>}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={15} className="text-center py-12 text-gray-400">ไม่พบข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily summary footer */}
      <div className="card bg-gray-900 text-white">
        <h3 className="font-semibold text-gray-300 text-sm mb-3">สรุปยอดเงินรายวัน — {date}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400">ค่าแรงพื้นฐาน</p>
            <p className="text-xl font-bold text-white">฿{fmt(summary.totalBase)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">เบี้ยเลี้ยงรวม</p>
            <p className="text-xl font-bold text-green-400">+฿{fmt(summary.totalAllowance)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">หักล่วงหน้า</p>
            <p className="text-xl font-bold text-red-400">-฿{fmt(summary.totalDeduction)}</p>
          </div>
          <div className="border-t md:border-t-0 md:border-l border-gray-700 md:pl-4 pt-2 md:pt-0">
            <p className="text-xs text-gray-400">ยอดสุทธิทั้งหมด</p>
            <p className="text-2xl font-bold text-emerald-400">฿{fmt(summary.totalNet)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{summary.present} คน มางาน จาก {rows.length} คน</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        <button onClick={() => load(date)} disabled={loading || saving}
          className="px-5 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-xl text-sm disabled:opacity-40 transition-colors">
          ยกเลิก / โหลดใหม่
        </button>
        <button onClick={() => handleSave('draft')} disabled={saving || loading}
          className="px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white font-medium rounded-xl text-sm disabled:opacity-40 transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกร่าง (Save Draft)'}
        </button>
        <button onClick={() => handleSave('approve')} disabled={saving || loading}
          className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xl text-sm disabled:opacity-40 transition-colors shadow-sm">
          {saving ? 'กำลังอนุมัติ...' : 'ยืนยันการอนุมัติ (Confirm & Submit)'}
        </button>
      </div>
    </div>
  )
}
