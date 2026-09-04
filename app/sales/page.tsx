'use client'

export const runtime = 'edge'

import { useEffect, useState, useCallback } from 'react'
import { getTodayString, formatCurrency, formatThaiTime, getEmployeeTypeLabel } from '@/lib/utils'

interface Sale {
  id: string
  employee_id: string | null
  employee_name: string | null
  employee_type: string
  sales_point_id: string
  sales_point_name: string
  date: string
  amount: number
  notes: string | null
  created_at: string
}

interface Employee {
  id: string
  name: string
  employee_type: string
}

interface SalesPoint {
  id: string
  name: string
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [date, setDate] = useState(getTodayString())
  const [filterSalesPoint, setFilterSalesPoint] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    employee_id: '',
    sales_point_id: '',
    amount: '',
    notes: '',
  })

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      let url = `/api/sales?date=${date}`
      if (filterSalesPoint) url += `&sales_point_id=${filterSalesPoint}`
      const res = await fetch(url)
      const data = await res.json() as any
      setSales(data.sales || [])
    } finally {
      setLoading(false)
    }
  }, [date, filterSalesPoint])

  useEffect(() => {
    fetchSales()
    fetch('/api/employees?type=sales')
      .then((r) => r.json())
      .then((d: any) => setEmployees(d.employees || []))
    fetch('/api/sales-points')
      .then((r) => r.json())
      .then((d: any) => setSalesPoints(d.salesPoints || []))
  }, [fetchSales])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.sales_point_id || !form.amount) {
      alert('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id || null,
          sales_point_id: form.sales_point_id,
          amount: parseFloat(form.amount),
          date,
          notes: form.notes || undefined,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setForm({ employee_id: '', sales_point_id: '', amount: '', notes: '' })
        fetchSales()
      } else {
        const data = await res.json() as any
        alert(data.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) return
    await fetch(`/api/sales?id=${id}`, { method: 'DELETE' })
    fetchSales()
  }

  const totalSales = sales.reduce((sum, s) => sum + s.amount, 0)

  // ยอดขายที่ไม่ระบุพนักงานจะถูกรวมไว้เป็น "ยอดขายของสาขา"
  const byEmployee = sales.reduce((acc, s) => {
    const key = s.employee_id || '__branch__'
    if (!acc[key]) {
      acc[key] = { name: s.employee_name || 'ยอดขายของสาขา', total: 0, count: 0 }
    }
    acc[key].total += s.amount
    acc[key].count += 1
    return acc
  }, {} as Record<string, { name: string; total: number; count: number }>)

  const bySalesPoint = sales.reduce((acc, s) => {
    if (!acc[s.sales_point_id]) {
      acc[s.sales_point_id] = { name: s.sales_point_name, total: 0 }
    }
    acc[s.sales_point_id].total += s.amount
    return acc
  }, {} as Record<string, { name: string; total: number }>)

  const exportCSV = () => {
    const headers = ['ชื่อพนักงาน', 'จุดขาย', 'วันที่', 'ยอดขาย', 'หมายเหตุ']
    const rows = sales.map((s) => [
      s.employee_name || 'ยอดขายของสาขา',
      s.sales_point_name,
      s.date,
      s.amount,
      s.notes || '',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales_${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ยอดขาย</h1>
          <p className="text-gray-500 text-sm mt-1">รวมวันนี้: {formatCurrency(totalSales)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            บันทึกยอดขาย
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="label text-xs">วันที่</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label text-xs">จุดขาย</label>
            <select
              className="input-field"
              value={filterSalesPoint}
              onChange={(e) => setFilterSalesPoint(e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {salesPoints.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={fetchSales} className="btn-secondary text-sm">
              ค้นหา
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">บันทึกยอดขาย</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">พนักงาน</label>
                <select
                  className="input-field"
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                >
                  <option value="">-- ยอดขายของสาขา (ไม่ระบุพนักงาน) --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Incentive คิดจากยอดขายของสาขาและจ่ายให้คนที่มาทำงานวันนั้น จึงไม่ต้องระบุพนักงาน
                  ระบุเฉพาะกรณีที่ต้องการคิดค่าคอมมิชชั่นรายบุคคล
                </p>
              </div>
              <div>
                <label className="label">จุดขาย *</label>
                <select
                  className="input-field"
                  value={form.sales_point_id}
                  onChange={(e) => setForm({ ...form, sales_point_id: e.target.value })}
                  required
                >
                  <option value="">-- เลือกจุดขาย --</option>
                  {salesPoints.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">ยอดขาย (฿) *</label>
                <input
                  type="number"
                  className="input-field"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label className="label">หมายเหตุ</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="หมายเหตุ (ถ้ามี)"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                ยกเลิก
              </button>
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </form>
        </div>
      )}

      {!loading && sales.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">ยอดขายแยกตามพนักงาน</h3>
            <div className="space-y-2">
              {Object.entries(byEmployee)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([id, data]) => (
                  <div key={id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{data.name}</p>
                      <p className="text-xs text-gray-500">{data.count} รายการ</p>
                    </div>
                    <span className="font-semibold text-green-700">{formatCurrency(data.total)}</span>
                  </div>
                ))}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3">ยอดขายแยกตามจุดขาย</h3>
            <div className="space-y-2">
              {Object.entries(bySalesPoint)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([id, data]) => (
                  <div key={id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <p className="font-medium text-sm">{data.name}</p>
                    <span className="font-semibold text-green-700">{formatCurrency(data.total)}</span>
                  </div>
                ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between">
              <span className="font-semibold">รวมทั้งหมด</span>
              <span className="font-bold text-lg text-green-700">{formatCurrency(totalSales)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการยอดขาย</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>ไม่มีข้อมูลยอดขาย</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">พนักงาน</th>
                  <th className="table-header">จุดขาย</th>
                  <th className="table-header">ยอดขาย</th>
                  <th className="table-header">หมายเหตุ</th>
                  <th className="table-header">เวลา</th>
                  <th className="table-header">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      {sale.employee_name || <span className="text-gray-400">ยอดขายของสาขา</span>}
                    </td>
                    <td className="table-cell text-gray-600">{sale.sales_point_name}</td>
                    <td className="table-cell font-semibold text-green-700">{formatCurrency(sale.amount)}</td>
                    <td className="table-cell text-gray-500">{sale.notes || '-'}</td>
                    <td className="table-cell text-gray-500 font-mono text-sm">
                      {formatThaiTime(sale.created_at)}
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={2} className="table-cell font-semibold">รวม</td>
                  <td className="table-cell font-bold text-green-700 text-base">{formatCurrency(totalSales)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
