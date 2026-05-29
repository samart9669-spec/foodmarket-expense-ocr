'use client'

import { useEffect, useState, useCallback } from 'react'
import { getTodayString, formatCurrency, getEmployeeTypeLabel, getPayrollStatusLabel } from '@/lib/utils'
import EmployeeTypeTag from '@/components/EmployeeTypeTag'

interface PayrollRecord {
  id: string
  employee_id: string
  employee_name: string
  employee_type: string
  period_start: string
  period_end: string
  days_worked: number
  day_rate_total: number
  ot_hours_total: number
  ot_total: number
  sales_total: number
  commission_total: number
  bonus: number
  deductions: number
  total_pay: number
  status: string
  notes: string | null
  created_at: string
}

interface Employee {
  id: string
  name: string
  employee_type: string
  daily_rate: number
  ot_rate: number
  commission_rate: number
}

interface CalcResult {
  employee: {
    id: string
    name: string
    employee_type: string
    daily_rate: number
    ot_rate: number
    commission_rate: number
  }
  calculation: {
    days_worked: number
    day_rate_total: number
    ot_hours_total: number
    ot_total: number
    sales_total: number
    commission_total: number
    bonus: number
    deductions: number
    total_pay: number
  }
}

export default function PayrollPage() {
  const [payrollList, setPayrollList] = useState<PayrollRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Period for calculation
  const now = new Date()
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [periodStart, setPeriodStart] = useState(firstDay)
  const [periodEnd, setPeriodEnd] = useState(getTodayString())
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [bonus, setBonus] = useState(0)
  const [deductions, setDeductions] = useState(0)

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState('')

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/payroll')
      const data = await res.json()
      setPayrollList(data.payroll || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPayroll()
    fetch('/api/employees')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees || []))
  }, [fetchPayroll])

  const handleCalculate = async () => {
    if (!selectedEmployee) {
      setCalcError('กรุณาเลือกพนักงาน')
      return
    }
    setCalculating(true)
    setCalcError('')
    setCalcResult(null)

    try {
      const res = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployee,
          period_start: periodStart,
          period_end: periodEnd,
          bonus,
          deductions,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCalcError(data.error || 'เกิดข้อผิดพลาด')
        return
      }
      setCalcResult(data)
    } catch {
      setCalcError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
    } finally {
      setCalculating(false)
    }
  }

  const handleSave = async () => {
    if (!calcResult) return
    setSaving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: calcResult.employee.id,
          period_start: periodStart,
          period_end: periodEnd,
          ...calcResult.calculation,
        }),
      })
      if (res.ok) {
        setCalcResult(null)
        setSelectedEmployee('')
        setBonus(0)
        setDeductions(0)
        fetchPayroll()
        alert('บันทึกข้อมูลเงินเดือนสำเร็จ')
      } else {
        const data = await res.json()
        alert(data.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    await fetch('/api/payroll', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    fetchPayroll()
  }

  const exportCSV = () => {
    const headers = [
      'ชื่อ', 'ประเภท', 'งวด', 'วันทำงาน', 'ค่าแรง', 'OT ชั่วโมง',
      'ค่า OT', 'ยอดขาย', 'ค่าคอม', 'โบนัส', 'หัก', 'รวม', 'สถานะ'
    ]
    const rows = payrollList.map((p) => [
      p.employee_name,
      getEmployeeTypeLabel(p.employee_type),
      `${p.period_start} ถึง ${p.period_end}`,
      p.days_worked,
      p.day_rate_total,
      p.ot_hours_total,
      p.ot_total,
      p.sales_total,
      p.commission_total,
      p.bonus,
      p.deductions,
      p.total_pay,
      getPayrollStatusLabel(p.status),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll_${getTodayString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes[status] || classes.pending}`}>
        {getPayrollStatusLabel(status)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการเงินเดือน</h1>
          <p className="text-gray-500 text-sm mt-1">{payrollList.length} รายการ</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Calculator */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">คำนวณเงินเดือน</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="label">พนักงาน</label>
            <select
              className="input-field"
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
            >
              <option value="">-- เลือกพนักงาน --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ตั้งแต่วันที่</label>
            <input
              type="date"
              className="input-field"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">ถึงวันที่</label>
            <input
              type="date"
              className="input-field"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="btn-primary w-full disabled:opacity-50"
            >
              {calculating ? 'กำลังคำนวณ...' : 'คำนวณ'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">โบนัส (฿)</label>
            <input
              type="number"
              className="input-field"
              value={bonus}
              onChange={(e) => setBonus(Number(e.target.value))}
              min={0}
              step={100}
            />
          </div>
          <div>
            <label className="label">รายการหัก (฿)</label>
            <input
              type="number"
              className="input-field"
              value={deductions}
              onChange={(e) => setDeductions(Number(e.target.value))}
              min={0}
              step={100}
            />
          </div>
        </div>

        {calcError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {calcError}
          </div>
        )}

        {/* Calculation Result */}
        {calcResult && (
          <div className="mt-4 p-5 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-blue-900 text-lg">{calcResult.employee.name}</h3>
                <EmployeeTypeTag type={calcResult.employee.employee_type} />
              </div>
              <div className="text-right">
                <p className="text-sm text-blue-600">งวด {periodStart} ถึง {periodEnd}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500">วันทำงาน</p>
                <p className="text-xl font-bold text-gray-900">{calcResult.calculation.days_worked} วัน</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500">OT</p>
                <p className="text-xl font-bold text-orange-600">
                  {calcResult.calculation.ot_hours_total.toFixed(1)} ชม.
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500">ยอดขายรวม</p>
                <p className="text-xl font-bold text-green-700">
                  {formatCurrency(calcResult.calculation.sales_total)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-gray-500">ค่าคอมมิชชัน</p>
                <p className="text-xl font-bold text-purple-700">
                  {formatCurrency(calcResult.calculation.commission_total)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ค่าแรงรายวัน ({calcResult.calculation.days_worked} วัน × {formatCurrency(calcResult.employee.daily_rate)})</span>
                <span className="font-medium">{formatCurrency(calcResult.calculation.day_rate_total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ค่า OT ({calcResult.calculation.ot_hours_total.toFixed(1)} ชม. × {formatCurrency(calcResult.employee.ot_rate)})</span>
                <span className="font-medium">{formatCurrency(calcResult.calculation.ot_total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">ค่าคอมมิชชัน ({calcResult.employee.commission_rate}% ของ {formatCurrency(calcResult.calculation.sales_total)})</span>
                <span className="font-medium">{formatCurrency(calcResult.calculation.commission_total)}</span>
              </div>
              {calcResult.calculation.bonus > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">โบนัส</span>
                  <span className="font-medium text-green-600">+{formatCurrency(calcResult.calculation.bonus)}</span>
                </div>
              )}
              {calcResult.calculation.deductions > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">รายการหัก</span>
                  <span className="font-medium text-red-600">-{formatCurrency(calcResult.calculation.deductions)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span>รวมทั้งหมด</span>
                <span className="text-blue-800">{formatCurrency(calcResult.calculation.total_pay)}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลเงินเดือน'}
              </button>
              <button onClick={() => setCalcResult(null)} className="btn-secondary">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payroll Records */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">รายการเงินเดือน</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : payrollList.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <p>ยังไม่มีข้อมูลเงินเดือน</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">พนักงาน</th>
                  <th className="table-header">ประเภท</th>
                  <th className="table-header">งวด</th>
                  <th className="table-header">วัน</th>
                  <th className="table-header">ค่าแรง</th>
                  <th className="table-header">OT</th>
                  <th className="table-header">ค่าคอม</th>
                  <th className="table-header">โบนัส</th>
                  <th className="table-header">หัก</th>
                  <th className="table-header">รวม</th>
                  <th className="table-header">สถานะ</th>
                  <th className="table-header">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payrollList.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{p.employee_name}</td>
                    <td className="table-cell">
                      <EmployeeTypeTag type={p.employee_type} />
                    </td>
                    <td className="table-cell text-xs text-gray-500">
                      {p.period_start} ถึง<br />{p.period_end}
                    </td>
                    <td className="table-cell text-center">{p.days_worked}</td>
                    <td className="table-cell">{formatCurrency(p.day_rate_total)}</td>
                    <td className="table-cell">
                      {p.ot_hours_total > 0 ? (
                        <span className="text-orange-600">{formatCurrency(p.ot_total)}</span>
                      ) : '-'}
                    </td>
                    <td className="table-cell">
                      {p.commission_total > 0 ? (
                        <span className="text-purple-600">{formatCurrency(p.commission_total)}</span>
                      ) : '-'}
                    </td>
                    <td className="table-cell">
                      {p.bonus > 0 ? <span className="text-green-600">{formatCurrency(p.bonus)}</span> : '-'}
                    </td>
                    <td className="table-cell">
                      {p.deductions > 0 ? <span className="text-red-600">-{formatCurrency(p.deductions)}</span> : '-'}
                    </td>
                    <td className="table-cell font-bold text-blue-800">
                      {formatCurrency(p.total_pay)}
                    </td>
                    <td className="table-cell">{getStatusBadge(p.status)}</td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        {p.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(p.id, 'approved')}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            อนุมัติ
                          </button>
                        )}
                        {p.status === 'approved' && (
                          <button
                            onClick={() => handleUpdateStatus(p.id, 'paid')}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            จ่ายแล้ว
                          </button>
                        )}
                        {p.status === 'paid' && (
                          <span className="text-xs text-gray-400">เสร็จสิ้น</span>
                        )}
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
