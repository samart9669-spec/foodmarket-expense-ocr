'use client'

export const runtime = 'edge'

import { useEffect, useState, useCallback } from 'react'
import { getTodayString, formatCurrency, getEmployeeTypeLabel, getPayrollStatusLabel, getAuthHeaders, getAdminRole } from '@/lib/utils'
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
  created_by: string | null
  original_total_pay: number | null
  edited_at: string | null
  edited_by: string | null
}

interface EditForm {
  days_worked: number
  day_rate_total: number
  ot_hours_total: number
  ot_total: number
  sales_total: number
  commission_total: number
  bonus: number
  deductions: number
  total_pay: number
  notes: string
}

/** รวมทั้งหมด = ค่าแรง + OT + คอมมิชชัน + โบนัส − รายการหัก */
function sumTotal(f: { day_rate_total: number; ot_total: number; commission_total: number; bonus: number; deductions: number }): number {
  return Math.round(((f.day_rate_total || 0) + (f.ot_total || 0) + (f.commission_total || 0) + (f.bonus || 0) - (f.deductions || 0)) * 100) / 100
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

  const now = new Date()
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [periodStart, setPeriodStart] = useState(firstDay)
  const [periodEnd, setPeriodEnd] = useState(getTodayString())
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [bonus, setBonus] = useState(0)
  const [deductions, setDeductions] = useState(0)

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState('')
  // Editable copy of the calculation, so a wrong figure can be corrected
  // before the record is saved.
  const [calcEdit, setCalcEdit] = useState<CalcResult['calculation'] | null>(null)
  const [manualTotal, setManualTotal] = useState(false)

  // Inline editing of an already saved payroll record
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editManualTotal, setEditManualTotal] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [role, setRole] = useState('')

  useEffect(() => { setRole(getAdminRole()) }, [])

  const patchCalc = (patch: Partial<CalcResult['calculation']>) => {
    setCalcEdit(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (!manualTotal && patch.total_pay === undefined) next.total_pay = sumTotal(next)
      return next
    })
  }

  const patchEdit = (patch: Partial<EditForm>) => {
    setEditForm(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (!editManualTotal && patch.total_pay === undefined) next.total_pay = sumTotal(next)
      return next
    })
  }

  const startEdit = (p: PayrollRecord) => {
    setEditingId(p.id)
    // A stored total that doesn't match the formula was set by hand — keep it
    // that way instead of silently recalculating it.
    setEditManualTotal(p.total_pay !== sumTotal(p))
    setEditForm({
      days_worked: p.days_worked,
      day_rate_total: p.day_rate_total,
      ot_hours_total: p.ot_hours_total,
      ot_total: p.ot_total,
      sales_total: p.sales_total,
      commission_total: p.commission_total,
      bonus: p.bonus,
      deductions: p.deductions,
      total_pay: p.total_pay,
      notes: p.notes || '',
    })
  }

  const saveEdit = async () => {
    if (!editingId || !editForm) return
    setSavingEdit(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      if (res.ok) {
        setEditingId(null)
        setEditForm(null)
        fetchPayroll()
      } else {
        const d = await res.json() as any
        alert(d.error || 'บันทึกไม่สำเร็จ')
      }
    } catch {
      alert('เชื่อมต่อไม่สำเร็จ')
    } finally {
      setSavingEdit(false)
    }
  }

  const fetchPayroll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll${showAllUsers ? '?all=1' : ''}`, { headers: getAuthHeaders() })
      const data = await res.json() as any
      setPayrollList(data.payroll || [])
    } finally {
      setLoading(false)
    }
  }, [showAllUsers])

  useEffect(() => {
    fetchPayroll()
    fetch('/api/employees')
      .then((r) => r.json())
      .then((d: any) => setEmployees(d.employees || []))
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
      const data = await res.json() as any
      if (!res.ok) {
        setCalcError(data.error || 'เกิดข้อผิดพลาด')
        return
      }
      setCalcResult(data)
      setCalcEdit({ ...data.calculation })
      setManualTotal(false)
    } catch {
      setCalcError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
    } finally {
      setCalculating(false)
    }
  }

  const handleSave = async () => {
    if (!calcResult || !calcEdit) return
    setSaving(true)
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          employee_id: calcResult.employee.id,
          period_start: periodStart,
          period_end: periodEnd,
          ...calcEdit,
        }),
      })
      if (res.ok) {
        setCalcResult(null)
        setCalcEdit(null)
        setSelectedEmployee('')
        setBonus(0)
        setDeductions(0)
        fetchPayroll()
        alert('บันทึกข้อมูลเงินเดือนสำเร็จ')
      } else {
        const data = await res.json() as any
        alert(data.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    await fetch('/api/payroll', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ id, status }),
    })
    fetchPayroll()
  }

  const handleDelete = async (p: PayrollRecord) => {
    if (!confirm(`ลบรายการเงินเดือนของ ${p.employee_name}\nงวด ${p.period_start} ถึง ${p.period_end}?\n\nการลบไม่สามารถกู้คืนได้`)) return
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/payroll?id=${p.id}`, { method: 'DELETE', headers: getAuthHeaders() })
      if (res.ok) {
        setPayrollList(prev => prev.filter(x => x.id !== p.id))
      } else {
        const d = await res.json().catch(() => ({})) as any
        alert(d.error || 'ลบไม่สำเร็จ')
      }
    } catch {
      alert('เชื่อมต่อไม่สำเร็จ')
    } finally {
      setDeletingId(null)
    }
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
              step="any"
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
              step="any"
            />
          </div>
        </div>

        {calcError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {calcError}
          </div>
        )}

        {calcResult && calcEdit && (
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

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
              ทุกช่องแก้ไขได้ก่อนบันทึก — ถ้าระบบคำนวณพลาด พิมพ์ตัวเลขที่ถูกต้องทับได้เลย
            </div>

            <div className="bg-white rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="label text-xs">วันทำงาน (วัน)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.days_worked}
                    onChange={e => patchCalc({ days_worked: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">ค่าแรงรวม (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.day_rate_total}
                    onChange={e => patchCalc({ day_rate_total: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">OT (ชม.)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.ot_hours_total}
                    onChange={e => patchCalc({ ot_hours_total: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">ค่า OT (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.ot_total}
                    onChange={e => patchCalc({ ot_total: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">ยอดขายรวม (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.sales_total}
                    onChange={e => patchCalc({ sales_total: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">ค่าคอมมิชชัน (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.commission_total}
                    onChange={e => patchCalc({ commission_total: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">โบนัส (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.bonus}
                    onChange={e => patchCalc({ bonus: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label text-xs">รายการหัก (฿)</label>
                  <input type="number" min={0} step="any" className="input-field"
                    value={calcEdit.deductions}
                    onChange={e => patchCalc({ deductions: Number(e.target.value) })} />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label className="label text-xs">รวมทั้งหมดที่จ่ายจริง (฿)</label>
                  <input type="number" min={0} step="any"
                    className={`input-field text-lg font-bold w-56 ${manualTotal ? 'border-amber-400 bg-amber-50' : ''}`}
                    value={calcEdit.total_pay}
                    onChange={e => { setManualTotal(true); setCalcEdit(prev => prev ? { ...prev, total_pay: Number(e.target.value) } : prev) }} />
                  <p className="text-xs text-gray-500 mt-1">
                    {manualTotal
                      ? 'กำหนดยอดเอง — ไม่คิดตามสูตรแล้ว'
                      : 'คิดจาก ค่าแรง + OT + คอม + โบนัส − หัก'}
                  </p>
                </div>
                {manualTotal && (
                  <button type="button"
                    onClick={() => { setManualTotal(false); setCalcEdit(prev => prev ? { ...prev, total_pay: sumTotal(prev) } : prev) }}
                    className="btn-secondary text-sm">
                    คำนวณยอดใหม่จากสูตร
                  </button>
                )}
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
              <button onClick={() => { setCalcResult(null); setCalcEdit(null) }} className="btn-secondary">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">รายการเงินเดือน</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {showAllUsers ? 'กำลังดูรายการของผู้ใช้ทุกคน' : 'แสดงเฉพาะรายการที่บัญชีนี้สร้าง'}
            </p>
          </div>
          {role === 'superadmin' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-600"
                checked={showAllUsers} onChange={e => setShowAllUsers(e.target.checked)} />
              ดูรายการของทุกผู้ใช้
            </label>
          )}
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
                {payrollList.map((p) => editingId === p.id && editForm ? (
                  <tr key={p.id} className="bg-amber-50">
                    <td colSpan={12} className="px-4 py-4">
                      <p className="font-semibold text-gray-900 mb-1">แก้ไขเงินเดือน — {p.employee_name}</p>
                      <p className="text-xs text-gray-500 mb-3">งวด {p.period_start} ถึง {p.period_end}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="label text-xs">วันทำงาน</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.days_worked}
                            onChange={e => patchEdit({ days_worked: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">ค่าแรงรวม (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.day_rate_total}
                            onChange={e => patchEdit({ day_rate_total: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">OT (ชม.)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.ot_hours_total}
                            onChange={e => patchEdit({ ot_hours_total: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">ค่า OT (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.ot_total}
                            onChange={e => patchEdit({ ot_total: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">ยอดขายรวม (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.sales_total}
                            onChange={e => patchEdit({ sales_total: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">ค่าคอมมิชชัน (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.commission_total}
                            onChange={e => patchEdit({ commission_total: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">โบนัส (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.bonus}
                            onChange={e => patchEdit({ bonus: Number(e.target.value) })} />
                        </div>
                        <div>
                          <label className="label text-xs">รายการหัก (฿)</label>
                          <input type="number" min={0} step="any" className="input-field"
                            value={editForm.deductions}
                            onChange={e => patchEdit({ deductions: Number(e.target.value) })} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-200">
                        <div>
                          <label className="label text-xs">ยอดจ่ายจริง (฿)</label>
                          <input type="number" min={0} step="any"
                            className={`input-field text-lg font-bold ${editManualTotal ? 'border-amber-400 bg-white' : ''}`}
                            value={editForm.total_pay}
                            onChange={e => { setEditManualTotal(true); setEditForm(prev => prev ? { ...prev, total_pay: Number(e.target.value) } : prev) }} />
                          <p className="text-xs text-gray-500 mt-1">
                            {editManualTotal ? 'กำหนดยอดเอง' : 'คิดจากสูตรอัตโนมัติ'}
                            {editManualTotal && (
                              <button type="button"
                                onClick={() => { setEditManualTotal(false); setEditForm(prev => prev ? { ...prev, total_pay: sumTotal(prev) } : prev) }}
                                className="ml-2 text-blue-600 hover:text-blue-800 underline">
                                คำนวณใหม่จากสูตร
                              </button>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="label text-xs">เหตุผลที่แก้ไข</label>
                          <input type="text" className="input-field"
                            placeholder="เช่น คำนวณ OT ผิด, ปรับยอดตามที่ตกลง..."
                            value={editForm.notes}
                            onChange={e => patchEdit({ notes: e.target.value })} />
                        </div>
                      </div>

                      <div className="flex gap-2 mt-4">
                        <button onClick={saveEdit} disabled={savingEdit} className="btn-primary disabled:opacity-50">
                          {savingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditForm(null) }} className="btn-secondary">
                          ยกเลิก
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      {p.employee_name}
                      {showAllUsers && (
                        <span className="block text-[11px] font-normal text-gray-400">
                          สร้างโดย {p.created_by || '—'}
                        </span>
                      )}
                    </td>
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
                      {p.edited_at && (
                        <span
                          title={`แก้ไขเมื่อ ${p.edited_at}${p.original_total_pay != null ? ` · ยอดเดิม ${formatCurrency(p.original_total_pay)}` : ''}${p.notes ? ` · ${p.notes}` : ''}`}
                          className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 align-middle cursor-help"
                        >
                          แก้ไขแล้ว
                        </span>
                      )}
                    </td>
                    <td className="table-cell">{getStatusBadge(p.status)}</td>
                    <td className="table-cell">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                        >
                          แก้ไข
                        </button>
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
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 font-medium"
                        >
                          {deletingId === p.id ? 'กำลังลบ...' : 'ลบ'}
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
