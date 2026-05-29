'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, getEmployeeTypeLabel } from '@/lib/utils'
import EmployeeTypeTag from '@/components/EmployeeTypeTag'

interface Employee {
  id: string
  name: string
  employee_type: string
  daily_rate: number
  ot_rate: number
  commission_rate: number
  phone: string | null
  is_active: number
  qr_code: string | null
  face_descriptor: string | null
  created_at: string
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'kitchen' | 'sales'>('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees')
      const json = await res.json()
      setEmployees(json.employees || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ต้องการปิดการใช้งาน "${name}" ใช่หรือไม่?`)) return
    setDeleting(id)
    try {
      await fetch(`/api/employees/${id}`, { method: 'DELETE' })
      setEmployees((prev) => prev.filter((e) => e.id !== id))
    } catch (e) {
      console.error(e)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = employees.filter((emp) => {
    const matchType = filter === 'all' || emp.employee_type === filter
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">พนักงานทั้งหมด</h1>
          <p className="text-gray-500 text-sm mt-1">{employees.length} คน</p>
        </div>
        <Link href="/employees/new" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          เพิ่มพนักงาน
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="ค้นหาชื่อพนักงาน..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'kitchen', 'sales'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'ทั้งหมด' : f === 'kitchen' ? 'ครัวกลาง' : 'พนักงานขาย'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="font-medium">ไม่พบพนักงาน</p>
            <p className="text-sm mt-1">
              <Link href="/employees/new" className="text-blue-600 hover:underline">
                เพิ่มพนักงานใหม่
              </Link>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">ชื่อ</th>
                  <th className="table-header">ประเภท</th>
                  <th className="table-header">ค่าแรงรายวัน</th>
                  <th className="table-header">OT/ชั่วโมง</th>
                  <th className="table-header">ค่าคอม (%)</th>
                  <th className="table-header">เบอร์โทร</th>
                  <th className="table-header">ใบหน้า</th>
                  <th className="table-header">QR Code</th>
                  <th className="table-header">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium text-gray-900">{emp.name}</td>
                    <td className="table-cell">
                      <EmployeeTypeTag type={emp.employee_type} />
                    </td>
                    <td className="table-cell">{formatCurrency(emp.daily_rate)}</td>
                    <td className="table-cell">{formatCurrency(emp.ot_rate)}</td>
                    <td className="table-cell">{emp.commission_rate || 0}%</td>
                    <td className="table-cell text-gray-500">{emp.phone || '-'}</td>
                    <td className="table-cell">
                      {emp.face_descriptor ? (
                        <span className="text-green-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          ลงทะเบียนแล้ว
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">ยังไม่ลงทะเบียน</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {emp.qr_code ? (
                        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{emp.qr_code}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/employees/${emp.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          แก้ไข
                        </Link>
                        <button
                          onClick={() => handleDelete(emp.id, emp.name)}
                          disabled={deleting === emp.id}
                          className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                        >
                          {deleting === emp.id ? 'กำลังลบ...' : 'ปิดใช้งาน'}
                        </button>
                      </div>
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
