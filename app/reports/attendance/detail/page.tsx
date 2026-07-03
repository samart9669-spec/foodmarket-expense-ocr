'use client'

export const runtime = 'edge'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface DayRow {
  date: string
  day_of_week: number
  kind: string
  check_in: string | null
  check_out: string | null
  ot_hours: number | null
  sales_point_name: string | null
  leave_type: string | null
  leave_reason: string | null
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
  summary: { present: number; late: number; leave: number; absent: number }
  days: DayRow[]
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const LEAVE_LABELS: Record<string, string> = { sick: 'ลาป่วย', annual: 'ลาพักร้อน', personal: 'ลากิจ', emergency: 'ลาฉุกเฉิน' }
const JOB_LABELS: Record<string, string> = { head_office: 'สำนักงานใหญ่', kitchen: 'ครัวกลาง', sales: 'พนักงานขาย' }

const KIND_BADGE: Record<string, { label: string; cls: string }> = {
  present: { label: 'มาทำงาน', cls: 'bg-green-100 text-green-700' },
  late: { label: 'มาสาย', cls: 'bg-orange-100 text-orange-700' },
  leave: { label: 'ลา', cls: 'bg-blue-100 text-blue-700' },
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
  const employeeId = params.get('employee_id') || ''
  const [month, setMonth] = useState(params.get('month') || new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!employeeId) { setError('ไม่ระบุพนักงาน'); setLoading(false); return }
    setLoading(true)
    setError('')
    fetch(`/api/reports/attendance-detail?employee_id=${encodeURIComponent(employeeId)}&month=${month}`)
      .then(r => r.json())
      .then((d: any) => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('เชื่อมต่อไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [employeeId, month])

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  }, [month])

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
        <input type="month" className="text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                </div>
              </div>
            ))}
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
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">สถานะ</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.days.map(d => {
                    const badge = KIND_BADGE[d.kind] ?? KIND_BADGE.none
                    const isWeekendish = d.kind === 'dayoff'
                    const note = d.kind === 'leave'
                      ? `${LEAVE_LABELS[d.leave_type ?? ''] ?? d.leave_type ?? ''}${d.leave_reason ? ` — ${d.leave_reason}` : ''}`
                      : d.sales_point_name || ''
                    return (
                      <tr key={d.date} className={isWeekendish ? 'bg-gray-50/60' : 'hover:bg-gray-50/60 transition-colors'}>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                        <td className={`px-3 py-2.5 text-xs ${isWeekendish ? 'text-gray-400' : 'text-gray-700'}`}>{THAI_DAYS[d.day_of_week]}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{fmtTime(d.check_in)}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">{fmtTime(d.check_out)}</td>
                        <td className="px-3 py-2.5 text-center">
                          {d.kind === 'future' || d.kind === 'none' ? (
                            <span className="text-gray-300 text-xs">-</span>
                          ) : (
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
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
