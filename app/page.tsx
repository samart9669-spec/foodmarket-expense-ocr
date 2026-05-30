'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, getEmployeeTypeLabel, getStatusLabel } from '@/lib/utils'

interface DashboardData {
  total_employees: number
  today_attendance: number
  today_sales_total: number
  pending_payroll: number
  recent_attendance: Array<{
    id: string
    employee_name: string
    employee_type: string
    check_in: string | null
    check_out: string | null
    status: string
    sales_point_name: string | null
  }>
  attendance_by_type: Array<{ employee_type: string; count: number }>
  weekly_sales: Array<{ date: string; total: number }>
  today: string
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    fetchDashboard()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard')
      const json = await res.json() as any
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      present: 'badge-present',
      absent: 'badge-absent',
      late: 'badge-late',
      half: 'badge-half',
    }
    return <span className={classes[status] || 'badge-present'}>{getStatusLabel(status)}</span>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  const kitchenCount = data?.attendance_by_type?.find((t) => t.employee_type === 'kitchen')?.count || 0
  const salesCount = data?.attendance_by_type?.find((t) => t.employee_type === 'sales')?.count || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">หน้าหลัก</h1>
          <p className="text-gray-500 text-sm mt-1">
            {currentTime.toLocaleDateString('th-TH', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-blue-800 font-mono">
            {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-xs text-gray-500 mt-1">เวลาปัจจุบัน</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">พนักงานวันนี้</p>
              <p className="text-3xl font-bold text-blue-800 mt-1">{data?.today_attendance || 0}</p>
              <p className="text-xs text-gray-400 mt-1">จาก {data?.total_employees || 0} คน</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="badge-kitchen">ครัว: {kitchenCount}</span>
            <span className="badge-sales">ขาย: {salesCount}</span>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">ยอดขายวันนี้</p>
              <p className="text-3xl font-bold text-green-700 mt-1">
                {formatCurrency(data?.today_sales_total || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">รวมทุกจุดขาย</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">พนักงานทั้งหมด</p>
              <p className="text-3xl font-bold text-purple-700 mt-1">{data?.total_employees || 0}</p>
              <p className="text-xs text-gray-400 mt-1">คนที่ใช้งานอยู่</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">รอคำนวณเงินเดือน</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{data?.pending_payroll || 0}</p>
              <p className="text-xs text-gray-400 mt-1">รายการ</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/attendance/scan" className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-14 h-14 bg-blue-800 rounded-xl flex items-center justify-center group-hover:bg-blue-700 transition-colors flex-shrink-0">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">สแกนเข้างาน</p>
            <p className="text-sm text-gray-500">Face ID หรือ QR Code</p>
          </div>
        </Link>
        <Link href="/sales" className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center group-hover:bg-green-700 transition-colors flex-shrink-0">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">บันทึกยอดขาย</p>
            <p className="text-sm text-gray-500">เพิ่มยอดขายประจำวัน</p>
          </div>
        </Link>
        <Link href="/payroll" className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center group-hover:bg-purple-700 transition-colors flex-shrink-0">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900">คำนวณเงินเดือน</p>
            <p className="text-sm text-gray-500">สรุปรายได้พนักงาน</p>
          </div>
        </Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">การเข้างานวันนี้</h2>
          <Link href="/attendance" className="text-sm text-blue-600 hover:text-blue-800">ดูทั้งหมด →</Link>
        </div>
        {!data?.recent_attendance || data.recent_attendance.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p>ยังไม่มีการเข้างานวันนี้</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="table-header">ชื่อ</th>
                  <th className="table-header">ประเภท</th>
                  <th className="table-header">เช็คอิน</th>
                  <th className="table-header">เช็คเอาต์</th>
                  <th className="table-header">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_attendance.map((att) => (
                  <tr key={att.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="table-cell font-medium">{att.employee_name}</td>
                    <td className="table-cell">
                      <span className={att.employee_type === 'kitchen' ? 'badge-kitchen' : 'badge-sales'}>
                        {getEmployeeTypeLabel(att.employee_type)}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-sm">
                      {att.check_in ? att.check_in.substring(11, 16) : '-'}
                    </td>
                    <td className="table-cell font-mono text-sm">
                      {att.check_out ? att.check_out.substring(11, 16) : '-'}
                    </td>
                    <td className="table-cell">{getStatusBadge(att.status)}</td>
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
