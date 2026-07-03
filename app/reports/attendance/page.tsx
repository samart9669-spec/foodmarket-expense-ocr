'use client'

export const runtime = 'edge'

import { useState, useEffect, useMemo } from 'react'

interface StatRow {
  employee_id: string
  name: string
  department: 'office' | 'kitchen' | 'sales'
  job_title: string
  present: number
  late: number
  leave: number
  absent: number
}

const DEPT_LABELS: Record<string, string> = {
  office: 'สำนักงานใหญ่',
  kitchen: 'ครัวกลาง',
  sales: 'พนักงานขาย',
}
const DEPT_ORDER = ['office', 'kitchen', 'sales'] as const

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function AttendanceStatsPage() {
  const [month, setMonth] = useState(currentMonth())
  const [department, setDepartment] = useState('all')
  const [employeeId, setEmployeeId] = useState('')
  const [allRows, setAllRows] = useState<StatRow[]>([]) // unfiltered — also feeds employee dropdown
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/reports/attendance-stats?month=${month}`)
      .then(r => r.json())
      .then((d: any) => {
        if (d.error) { setError(d.error); setAllRows([]) }
        else setAllRows(d.stats || [])
      })
      .catch(() => setError('เชื่อมต่อไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [month])

  // Reset employee filter when it no longer matches the department filter
  useEffect(() => {
    if (employeeId && !allRows.some(r => r.employee_id === employeeId && (department === 'all' || r.department === department))) {
      setEmployeeId('')
    }
  }, [department, allRows, employeeId])

  const employeeOptions = useMemo(
    () => allRows.filter(r => department === 'all' || r.department === department),
    [allRows, department]
  )

  const rows = useMemo(
    () => employeeOptions.filter(r => !employeeId || r.employee_id === employeeId),
    [employeeOptions, employeeId]
  )

  const byDept = useMemo(() => {
    const groups: Record<string, StatRow[]> = {}
    for (const r of rows) (groups[r.department] ||= []).push(r)
    return groups
  }, [rows])

  const total = (list: StatRow[], key: 'present' | 'late' | 'leave' | 'absent') =>
    list.reduce((s, r) => s + r[key], 0)

  const monthLabel = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  }, [month])

  const exportCSV = () => {
    const header = ['ชื่อ-นามสกุล', 'แผนก', 'มาทำงาน (วัน)', 'มาสาย (วัน)', 'ลา (วัน)', 'ขาด (วัน)']
    const lines = rows.map(r => [r.name, DEPT_LABELS[r.department], r.present, r.late, r.leave, r.absent].join(','))
    const csv = '﻿' + [`สถิติขาด ลา มาสาย ประจำเดือน ${monthLabel}`, header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `attendance-stats-${month}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">สถิติขาด ลา มาสาย</h1>
          <p className="text-gray-500 text-sm mt-0.5">สรุปการเข้างานของพนักงานประจำเดือน {monthLabel}</p>
        </div>
        <button onClick={exportCSV} disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export Excel (CSV)
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">ประจำเดือน</label>
          <input type="month" className="w-full text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={month} onChange={e => e.target.value && setMonth(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">แผนก</label>
          <select className="w-full text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="all">ทุกแผนก</option>
            {DEPT_ORDER.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">พนักงาน</label>
          <select className="w-full text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
            value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">ทุกคน</option>
            {employeeOptions.map(r => <option key={r.employee_id} value={r.employee_id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { key: 'present', label: 'มาทำงาน', color: 'text-green-600', bg: 'bg-green-50' },
          { key: 'late', label: 'มาสาย', color: 'text-orange-500', bg: 'bg-orange-50' },
          { key: 'leave', label: 'ลา', color: 'text-blue-600', bg: 'bg-blue-50' },
          { key: 'absent', label: 'ขาดงาน', color: 'text-red-600', bg: 'bg-red-50' },
        ] as const).map(c => (
          <div key={c.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-500">{c.label}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className={`text-3xl font-bold ${c.color}`}>{total(rows, c.key)}</span>
              <span className="text-sm text-gray-400">วัน</span>
            </div>
          </div>
        ))}
      </div>

      {/* Table grouped by department */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูลพนักงานตามเงื่อนไขที่เลือก</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">มาทำงาน (วัน)</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">มาสาย (วัน)</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">ลา (วัน)</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">ขาด (วัน)</th>
                </tr>
              </thead>
              <tbody>
                {DEPT_ORDER.filter(d => byDept[d]?.length).map(dept => (
                  <>
                    <tr key={`h-${dept}`} className="bg-gray-50">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-gray-600">
                        {DEPT_LABELS[dept]} · {byDept[dept].length} คน
                      </td>
                    </tr>
                    {byDept[dept].map(r => (
                      <tr key={r.employee_id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-3 py-3 font-medium text-gray-900">{r.name}</td>
                        <td className="px-3 py-3 text-center text-green-700">{r.present}</td>
                        <td className={`px-3 py-3 text-center ${r.late > 0 ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>{r.late}</td>
                        <td className={`px-3 py-3 text-center ${r.leave > 0 ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>{r.leave}</td>
                        <td className={`px-3 py-3 text-center ${r.absent > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{r.absent}</td>
                      </tr>
                    ))}
                    <tr key={`t-${dept}`} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-xs text-gray-500 font-medium text-right">รวม{DEPT_LABELS[dept]}</td>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-green-700">{total(byDept[dept], 'present')}</td>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-orange-500">{total(byDept[dept], 'late')}</td>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-blue-600">{total(byDept[dept], 'leave')}</td>
                      <td className="px-3 py-2 text-center text-xs font-semibold text-red-600">{total(byDept[dept], 'absent')}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          "ขาด" นับจากบันทึกขาดงาน + วันทำงานที่ผ่านมาแล้วซึ่งไม่มีการเช็คอินและไม่มีใบลาอนุมัติ (เฉพาะพนักงานที่กำหนดวันทำงานประจำ เช่น สำนักงานใหญ่ จ-ศ) · "ลา" นับจากใบลาที่อนุมัติแล้ว
        </p>
      </div>
    </div>
  )
}
