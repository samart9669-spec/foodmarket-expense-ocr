'use client'

export const runtime = 'edge'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getAuthHeaders } from '@/lib/utils'

interface EmployeeOption { id: string; name: string }

interface ExtraRound {
  session_no: number
  check_in: string | null
  check_out: string | null
  ot_hours: number | null
}

interface DayRow {
  date: string
  day_of_week: number
  kind: string
  check_in: string | null
  check_out: string | null
  hours: number | null
  ot_hours: number | null
  extra_rounds?: ExtraRound[]
  early_out: boolean
  offsite_location: string | null
  sales_point_name: string | null
  leave_type: string | null
  leave_reason: string | null
  leave_unit: string | null
  leave_start_time: string | null
  leave_end_time: string | null
  leave_hours: number | null
}

interface DetailData {
  month: string
  employee: {
    id: string
    name: string
    job_title: string
    work_start: string | null
    work_end: string | null
    work_days: number[]
  }
  summary: {
    present: number; late: number; leave: number; leave_hours: number; absent: number
    hours_total: number; ot_total: number
  }
  days: DayRow[]
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const LEAVE_LABELS: Record<string, string> = { sick: 'ลาป่วย', annual: 'ลาพักร้อน', personal: 'ลากิจ', emergency: 'ลาฉุกเฉิน' }
const JOB_LABELS: Record<string, string> = { head_office: 'สำนักงานใหญ่', kitchen: 'ครัวกลาง', sales: 'พนักงานขาย' }

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  present: { label: 'มาทำงาน', cls: 'bg-green-100 text-green-700' },
  late: { label: 'มาสาย', cls: 'bg-orange-100 text-orange-700' },
  leave: { label: 'ลา', cls: 'bg-blue-100 text-blue-700' },
  leave_hours: { label: 'ลาบางช่วง', cls: 'bg-sky-100 text-sky-700' },
  absent: { label: 'ขาดงาน', cls: 'bg-red-100 text-red-700' },
  missing: { label: 'ขาด (ไม่เช็คอิน)', cls: 'bg-red-100 text-red-700' },
  dayoff: { label: 'วันหยุด', cls: 'bg-gray-100 text-gray-400' },
  future: { label: '-', cls: 'text-gray-300' },
  none: { label: '-', cls: 'text-gray-300' },
}

function fmtTime(t: string | null): string {
  if (!t) return '-'
  const m = t.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '-'
}

function DetailContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [employeeId, setEmployeeId] = useState(params.get('employee_id') || '')
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [month, setMonth] = useState(params.get('month') || new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // The picker makes the page usable on its own, not only from the stats sheet
  useEffect(() => {
    fetch('/api/employees', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then((d: any) => {
        const list: EmployeeOption[] = (d.employees || []).map((e: any) => ({ id: e.id, name: e.name }))
        setEmployees(list)
        setEmployeeId(prev => prev || list[0]?.id || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!employeeId) { setLoading(false); return }
    setLoading(true)
    setError('')
    // Keep the URL shareable as the selection changes
    router.replace(`/reports/attendance/detail?employee_id=${encodeURIComponent(employeeId)}&month=${month}`)
    fetch(`/api/reports/attendance-detail?employee_id=${encodeURIComponent(employeeId)}&month=${month}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('เชื่อมต่อไม่สำเร็จ'))
      .finally(() => setLoading(false))
  // router is stable in the app router; re-running on it would loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, month])

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  }, [month])

  const exportCSV = () => {
    if (!data) return
    const headers = ['วันที่', 'วัน', 'เข้างาน', 'เลิกงาน', 'ชั่วโมง', 'OT', 'สถานะ', 'สาขา/หมายเหตุ']
    const rows = data.days.map(d => [
      d.date,
      THAI_DAYS[d.day_of_week],
      fmtTime(d.check_in),
      fmtTime(d.check_out),
      d.hours ?? '',
      d.ot_hours ?? '',
      (KIND_BADGE[d.kind] ?? KIND_BADGE.none).label,
      d.offsite_location || d.sales_point_name || '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${data.employee.name}-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/reports/attendance`)} className="text-gray-400 hover:text-gray-600 transition-colors group">
            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{data?.employee.name ?? 'รายละเอียดการเข้างาน'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {data ? (JOB_LABELS[data.employee.job_title] ?? data.employee.job_title) : ''}
              {data?.employee.work_start && data?.employee.work_end && (
                <> · เวลางาน {data.employee.work_start}-{data.employee.work_end}</>
              )}
              {' '}· ประจำเดือน {monthLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[200px]"
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
          >
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="month" className="text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
          <button
            onClick={exportCSV}
            disabled={!data}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {([
              { key: 'present', label: 'มาทำงาน', color: 'text-green-600' },
              { key: 'late', label: 'มาสาย', color: 'text-orange-500' },
              { key: 'leave', label: 'ลา', color: 'text-blue-600' },
              { key: 'absent', label: 'ขาดงาน', color: 'text-red-600' },
            ] as const).map(c => (
              <div key={c.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm text-gray-500">{c.label}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className={`text-3xl font-bold ${c.color}`}>{data.summary[c.key]}</span>
                  <span className="text-sm text-gray-400">วัน</span>
                  {c.key === 'leave' && data.summary.leave_hours > 0 && (
                    <span className="text-sm text-blue-500 font-medium">+{data.summary.leave_hours} ชม.</span>
                  )}
                </div>
              </div>
            ))}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm text-gray-500">ชั่วโมงรวม</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-bold text-gray-800">{data.summary.hours_total}</span>
                <span className="text-sm text-gray-400">ชม.</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm text-gray-500">OT รวม</p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-bold text-indigo-600">{data.summary.ot_total}</span>
                <span className="text-sm text-gray-400">ชม.</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">วันที่</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">วัน</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">เข้างาน</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">เลิกงาน</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">ชม.</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">OT</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">สถานะ</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.days.map(d => {
                    const badge = KIND_BADGE[d.kind] ?? KIND_BADGE.none
                    const isWeekendish = d.kind === 'dayoff'
                    const noteParts: string[] = []
                    if (d.kind === 'leave' || d.leave_unit === 'hour') {
                      const kindLabel = LEAVE_LABELS[d.leave_type ?? ''] ?? d.leave_type ?? ''
                      const hourPart = d.leave_unit === 'hour'
                        ? ` ${d.leave_start_time}–${d.leave_end_time} (${d.leave_hours} ชม.)`
                        : ''
                      noteParts.push(`${kindLabel}${hourPart}${d.leave_reason ? ` — ${d.leave_reason}` : ''}`)
                    } else if (d.offsite_location) {
                      noteParts.push(`นอกสถานที่: ${d.offsite_location}`)
                    } else if (d.sales_point_name) {
                      noteParts.push(d.sales_point_name)
                    }
                    for (const r of (d.extra_rounds || [])) {
                      noteParts.push(`กะพิเศษ ${fmtTime(r.check_in)}-${fmtTime(r.check_out)} (OT ${r.ot_hours ?? 0} ชม.)`)
                    }
                    const note = noteParts.join(' · ')
                    return (
                      <tr key={d.date} className={isWeekendish ? 'bg-gray-50/60' : 'hover:bg-gray-50/60 transition-colors'}>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                        <td className={`px-3 py-2.5 text-xs ${isWeekendish ? 'text-gray-400' : 'text-gray-700'}`}>{THAI_DAYS[d.day_of_week]}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{fmtTime(d.check_in)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{fmtTime(d.check_out)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">
                          {d.hours ? d.hours.toFixed(2) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs">
                          {d.ot_hours
                            ? <span className="text-indigo-600 font-medium">{d.ot_hours.toFixed(1)}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {d.kind === 'future' || d.kind === 'none' ? (
                            <span className="text-gray-300 text-xs">-</span>
                          ) : (
                            <span className="inline-flex flex-wrap justify-center gap-1">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                              {d.early_out && (
                                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">ออกก่อนเวลา</span>
                              )}
                              {d.offsite_location && (
                                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">นอกสถานที่</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{note}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function AttendanceDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
      <DetailContent />
    </Suspense>
  )
}
