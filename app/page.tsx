'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AttendanceRecord {
  id: string
  employee_id: string
  employee_name: string
  employee_type: string
  employee_code: string | null
  primary_point_name: string | null
  sales_point_name: string | null
  shift_name: string | null
  shift_start: string | null
  shift_end: string | null
  check_in: string | null
  check_out: string | null
  status: string
  regular_hours: number
  ot_hours: number
  daily_rate: number
  ot_rate: number
  early_out: number | null
  offsite_location: string | null
}

interface CostByPoint {
  point_name: string
  cost: number
  headcount: number
}

interface PendingLeave {
  id: string
  employee_name: string
  leave_type: string
  date_start: string
  date_end: string
}

interface DashboardData {
  total_employees: number
  today_attendance: number
  today_sales_total: number
  today_labor_cost: number
  pending_payroll: number
  pending_leaves: number
  pending_leave_list: PendingLeave[]
  recent_attendance: AttendanceRecord[]
  attendance_by_type: Array<{ employee_type: string; count: number }>
  cost_by_point: CostByPoint[]
  today: string
}

const LEAVE_LABELS: Record<string, string> = { sick: 'ลาป่วย', annual: 'ลาพักร้อน', personal: 'ลากิจ', emergency: 'ลาฉุกเฉิน' }

const BRANCH_OPTIONS = ['ทั้งหมด', 'จุดขาย 1', 'จุดขาย 2', 'จุดขาย 3']
const GROUP_OPTIONS = ['ทั้งหมด', 'ฟรอนต์ (หน้าร้าน)', 'ครัว']

const CHART_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-blue-400',
  'bg-sky-400',
  'bg-purple-500',
  'bg-orange-400',
  'bg-teal-400',
]

function formatTime(dt: string | null): string {
  if (!dt) return '-'
  try {
    const d = new Date(dt)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch { return '-' }
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] ?? '') + (parts[1][0] ?? '')
  return name.slice(0, 2)
}

function getTypeLabel(type: string): string {
  if (type === 'kitchen') return 'ครัว'
  if (type === 'sales') return 'ฟรอนต์'
  return 'Staff'
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-pink-500', 'bg-teal-500',
  'bg-orange-500', 'bg-purple-500', 'bg-cyan-500',
]

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState(GROUP_OPTIONS[0])
  const [selectedBranch, setSelectedBranch] = useState(BRANCH_OPTIONS[0])
  const [bonuses, setBonuses] = useState<Record<string, number>>({})
  const [deductions, setDeductions] = useState<Record<string, number>>({})

  const today = new Date()
  const todayStr = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((d: any) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const kitchenCount = data?.attendance_by_type?.find(t => t.employee_type === 'kitchen')?.count ?? 0
  const salesCount   = data?.attendance_by_type?.find(t => t.employee_type === 'sales')?.count ?? 0

  const totalCostByPoint = data?.cost_by_point?.reduce((s, p) => s + p.cost, 0) ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ─── Filter bar ─── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-48">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-0.5">กลุ่มงาน</p>
            <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
              className="w-full text-sm font-medium text-gray-800 bg-transparent border-0 outline-none cursor-pointer">
              {GROUP_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-3 flex-1 min-w-40">
          <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-0.5">สาขาปฏิบัติงาน</p>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
              className="w-full text-sm font-medium text-gray-800 bg-transparent border-0 outline-none cursor-pointer">
              {BRANCH_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">ประจำวันที่</p>
            <p className="text-sm font-medium text-gray-800">{todayStr}</p>
          </div>
        </div>
      </div>

      {/* ─── Stat cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* Card 1: พนักงานสแกนเข้างาน */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-2">พนักงานสแกนเข้างานแล้ว</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">{data?.today_attendance ?? 0}</span>
                <span className="text-xl text-gray-400">/ {data?.total_employees ?? 0}</span>
                <span className="text-sm text-gray-400">คน</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                  หน้าร้าน {salesCount} คน
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  ครัว {kitchenCount} คน
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center ml-3 flex-shrink-0">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card 2: ต้นทุนค่าแรงสะสมวันนี้ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-2">ต้นทุนค่าแรงสะสมวันนี้</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">
                  {(data?.today_labor_cost ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                </span>
                <span className="text-sm text-gray-400">บาท</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">คำนวณจากอัตรารายวัน + OT พนักงานที่เข้างานวันนี้</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center ml-3 flex-shrink-0">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card 3: รายการรอตรวจสอบ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-orange-500 font-medium mb-2">รายการรอตรวจสอบ (Alerts)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">{data?.pending_payroll ?? 0}</span>
                <span className="text-sm text-gray-400">รายการ</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">เงินเดือนที่ค้างอนุมัติ (pending)</p>
            </div>
            <div className="flex flex-col items-end justify-between h-full gap-3">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Card 4: ใบลารออนุมัติ */}
        <Link href="/admin/leave" className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 block hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium mb-2 ${(data?.pending_leaves ?? 0) > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
                ใบลารออนุมัติ
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-gray-900">{data?.pending_leaves ?? 0}</span>
                <span className="text-sm text-gray-400">รายการ</span>
              </div>
              {(data?.pending_leave_list?.length ?? 0) > 0 ? (
                <div className="mt-2 space-y-0.5">
                  {data!.pending_leave_list.slice(0, 2).map(l => (
                    <p key={l.id} className="text-xs text-gray-500 truncate">
                      {l.employee_name} · {LEAVE_LABELS[l.leave_type] ?? l.leave_type} {l.date_start}
                    </p>
                  ))}
                  {(data?.pending_leaves ?? 0) > 2 && (
                    <p className="text-xs text-gray-400">และอีก {(data?.pending_leaves ?? 0) - 2} รายการ...</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-2">ไม่มีใบลาค้างอนุมัติ</p>
              )}
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ml-3 flex-shrink-0 ${
              (data?.pending_leaves ?? 0) > 0 ? 'bg-yellow-50' : 'bg-gray-100'
            }`}>
              <svg className={`w-6 h-6 ${(data?.pending_leaves ?? 0) > 0 ? 'text-yellow-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* ─── Labor Cost Allocation ─── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-800">
            สัดส่วนต้นทุนค่าแรงประจำวันแยกตามจุดปฏิบัติงาน (Labor Cost Allocation)
          </h2>
          <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            ดูรายงานฉบับเต็ม
          </button>
        </div>

        {data?.cost_by_point && data.cost_by_point.length > 0 ? (
          <div className="space-y-4">
            {data.cost_by_point.map((point, idx) => {
              const pct = totalCostByPoint > 0
                ? Math.round((point.cost / totalCostByPoint) * 100)
                : 0
              return (
                <div key={point.point_name} className="flex items-center gap-3">
                  <div className="w-48 text-sm text-gray-700 font-medium flex-shrink-0 truncate">
                    {point.point_name}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden min-w-20">
                    <div
                      className={`h-full rounded-full transition-all ${CHART_COLORS[idx % CHART_COLORS.length]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-10 text-sm text-gray-700 font-semibold text-right flex-shrink-0">{pct}%</div>
                  <div className="w-28 text-sm text-gray-600 text-right font-medium flex-shrink-0">
                    {point.cost.toLocaleString('th-TH', { maximumFractionDigits: 0 })} THB
                  </div>
                  <div className="hidden xl:flex items-center gap-1.5 text-xs text-gray-400 flex-1 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                    <span className="truncate">{point.headcount} คน</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">ยังไม่มีข้อมูลการเข้างานวันนี้</p>
          </div>
        )}
      </div>

      {/* ─── Daily Timesheet ─── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">
            ตารางตรวจสอบและปรับปรุงได้รายวัน (Daily Timesheet &amp; Adjustment Management)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">รหัสพนักงาน</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">ชื่อ - ประเภท</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">สังกัดหลัก</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">จุดปฏิบัติงานวันนี้</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                  <span className="flex items-center gap-1">
                    สถานะกะเวลา
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                </th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">เงินเพิ่มพิเศษ (฿)</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">เงินหัก/เบิก (฿)</th>
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">สถานะ</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.recent_attendance ?? []).map((att, idx) => {
                const empCode = att.employee_code ?? att.employee_id.slice(0, 10).toUpperCase()
                const primaryBranch = att.primary_point_name ?? '-'
                const todayBranch = att.sales_point_name ?? att.primary_point_name ?? '-'
                const isCrossPosted = att.sales_point_name && att.primary_point_name &&
                  att.sales_point_name !== att.primary_point_name
                const shiftRange = att.shift_start && att.shift_end
                  ? `${att.shift_start} - ${att.shift_end}`
                  : null
                const barPct = att.check_out ? 100 : (att.check_in ? 60 : 0)
                const isLate    = att.status === 'late'
                const isAbsent  = att.status === 'absent'
                // approved = present + has check_out; pending = present but still in
                const isApproved = !isAbsent && att.check_out !== null
                const isPending  = !isAbsent && att.check_out === null

                return (
                  <tr key={att.id} className="hover:bg-gray-50/60 transition-colors">

                    <td className="px-3 py-4 text-xs text-gray-500 font-mono">{empCode}</td>

                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {getInitials(att.employee_name)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 whitespace-nowrap">{att.employee_name}</p>
                          <p className="text-xs text-gray-400">{getTypeLabel(att.employee_type)}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-4">
                      {primaryBranch !== '-' ? (
                        <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                          {primaryBranch}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      {att.offsite_location ? (
                        <>
                          <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700">
                            {att.offsite_location}
                          </span>
                          <p className="text-xs text-purple-600 mt-0.5">นอกสถานที่</p>
                        </>
                      ) : todayBranch !== '-' ? (
                        <>
                          <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                            isCrossPosted ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {todayBranch}
                          </span>
                          {isCrossPosted && (
                            <p className="text-xs text-yellow-600 mt-0.5">ย้ายช่วยสาขา</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>

                    <td className="px-3 py-4 min-w-44">
                      {shiftRange && (
                        <p className="text-xs text-gray-400 mb-1">{shiftRange}</p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-600 mb-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{formatTime(att.check_in)} - {formatTime(att.check_out)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${
                            isAbsent ? 'bg-red-400' : isLate ? 'bg-orange-400' : 'bg-blue-500'
                          }`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <p className={`text-xs mt-0.5 ${
                        isAbsent ? 'text-red-600' : isLate ? 'text-orange-500' : 'text-gray-500'
                      }`}>
                        {isAbsent ? 'ขาดงาน' : isLate ? 'สาย' : 'ตรงเวลา'}
                        {att.early_out === 1 && <span className="text-yellow-600"> · ออกก่อนเวลา</span>}
                      </p>
                    </td>

                    {/* เงินเพิ่มพิเศษ – ไม่มีใน DB ปล่อยว่างไว้ */}
                    <td className="px-3 py-4 text-center">
                      <div className="mx-auto w-20">
                        <input
                          type="number" min="0"
                          value={bonuses[att.id] ?? ''}
                          placeholder="0"
                          onChange={e => setBonuses(prev => ({ ...prev, [att.id]: Number(e.target.value) }))}
                          className="w-full text-center text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    </td>

                    {/* เงินหัก/เบิก – ไม่มีใน DB ปล่อยว่างไว้ */}
                    <td className="px-3 py-4 text-center">
                      <div className="mx-auto w-20">
                        <input
                          type="number" min="0"
                          value={deductions[att.id] ?? ''}
                          placeholder="0"
                          onChange={e => setDeductions(prev => ({ ...prev, [att.id]: Number(e.target.value) }))}
                          className={`w-full text-center text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 ${
                            (deductions[att.id] ?? 0) > 0
                              ? 'border-red-300 text-red-600 focus:ring-red-400'
                              : 'border-gray-200 focus:ring-blue-400'
                          }`}
                        />
                      </div>
                    </td>

                    <td className="px-3 py-4 text-center">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          อนุมัติแล้ว
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-500 font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          รอตรวจสอบ
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-500 font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          ขาดงาน
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      <button className="text-gray-300 hover:text-gray-500 p-1 transition-colors">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </button>
                    </td>

                  </tr>
                )
              })}

              {(!data?.recent_attendance || data.recent_attendance.length === 0) && (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-gray-400 text-sm">
                    ยังไม่มีข้อมูลการเข้างานวันนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            แสดง 1 - {data?.recent_attendance?.length ?? 0} จาก {data?.today_attendance ?? 0} รายการ
          </p>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
            <button className="flex items-center gap-1.5 text-sm text-white bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              บันทึกยอดและยืนยันจ่ายเงิน
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
