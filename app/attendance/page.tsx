'use client'

export const runtime = 'edge'

import { useEffect, useState, useCallback } from 'react'
import { getTodayString, formatCurrency, getEmployeeTypeLabel, getStatusLabel } from '@/lib/utils'
import EmployeeTypeTag from '@/components/EmployeeTypeTag'

interface AttendanceRecord {
  id: string
  employee_id: string
  employee_name: string
  employee_type: string
  date: string
  check_in: string | null
  check_out: string | null
  check_in_method: string | null
  check_out_method: string | null
  regular_hours: number
  ot_hours: number
  status: string
  sales_point_name: string | null
  notes: string | null
}

interface Employee {
  id: string
  name: string
  employee_type: string
  daily_rate: number
  ot_rate: number
}

interface ManualForm {
  employee_id: string
  date: string
  check_in: string
  check_out: string
  status: string
  notes: string
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [date, setDate] = useState(getTodayString())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ManualForm>({
    employee_id: '',
    date: getTodayString(),
    check_in: '',
    check_out: '',
    status: 'present',
    notes: '',
  })

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attendance?date=${date}`)
      const res = await fetch(`/api/attendance?date=${date}`);
      const data = await res.json() as { attendance: any[] }; // <--- ระบุว่าข้างในมี attendance เป็น Array
      setRecords(data.attendance || [])
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    fetchRecords()
    fetch('/api/employees')
      .then((r) => r.json())
      .then((d: any) => setEmployees(d.employees || []))
  }, [fetchRecords])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const checkInFull = form.check_in ? `${form.date} ${form.check_in}:00` : undefined
      const checkOutFull = form.check_out ? `${form.date} ${form.check_out}:00` : undefined
      let regularHours = 0
      let otHours = 0
      if (checkInFull && checkOutFull) {
        const inT = new Date(checkInFull)
        const outT = new Date(checkOutFull)
        const total = Math.max(0, (outT.getTime() - inT.getTime()) / 3600000)
        regularHours = Math.min(total, 8)
        otHours = Math.max(0, total - 8)
      }
      const payload = {
        employee_id: form.employee_id,
        date: form.date,
        check_in: checkInFull,
        check_out: checkOutFull,
        check_in_method: 'manual',
        check_out_method: checkOutFull ? 'manual' : undefined,
        regular_hours: regularHours,
        ot_hours: otHours,
        status: form.status,
        notes: form.notes || undefined,
      }
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setShowForm(false)
        setForm({ employee_id: '', date: getTodayString(), check_in: '', check_out: '', status: 'present', notes: '' })
        fetchRecords()
      } else {
        const data = await res.json() as any
        alert(data.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSaving(false)
    }
  }

  const exportCSV = () => {
    const headers = ['ชื่อ', 'ประเภท', 'วันที่', 'เช็คอิน', 'เช็คเอาต์', 'ชั่วโมงปกติ', 'OT', 'สถานะ']
    const rows = records.map((r) => [
      r.employee_name, getEmployeeTypeLabel(r.employee_type), r.date,
      r.check_in ? r.check_in.substring(11, 16) : '-',
      r.check_out ? r.check_out.substring(11, 16) : '-',
      r.regular_hours?.toFixed(2) || '0', r.ot_hours?.toFixed(2) || '0', getStatusLabel(r.status),
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `attendance_${date}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const getMethodBadge = (method: string | null) => {
    if (!method) return null
    const labels: Record<string, string> = { face: 'Face', qr: 'QR', manual: 'Manual' }
    const colors: Record<string, string> = {
      face: 'bg-purple-100 text-purple-700', qr: 'bg-blue-100 text-blue-700', manual: 'bg-gray-100 text-gray-600',
    }
    return <span className={`text-xs px-1.5 py-0.5 rounded ${colors[method] || colors.manual}`}>{labels[method] || method}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">บันทึกการเข้างาน</h1>
          <p className="text-gray-500 text-sm mt-1">{records.length} รายการ</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">Export CSV</button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">+ เพิ่มรายการ</button>
        </div>
      </div>
      <div className="card">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">วันที่:</label>
          <input type="date" className="input-field max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={fetchRecords} className="btn-secondary text-sm">ค้นหา</button>
        </div>
      </div>
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'มาทำงาน', count: records.filter((r) => r.status === 'present').length, color: 'text-green-700 bg-green-50' },
            { label: 'มาสาย', count: records.filter((r) => r.status === 'late').length, color: 'text-yellow-700 bg-yellow-50' },
            { label: 'ครึ่งวัน', count: records.filter((r) => r.status === 'half').length, color: 'text-blue-700 bg-blue-50' },
            { label: 'ขาดงาน', count: records.filter((r) => r.status === 'absent').length, color: 'text-red-700 bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`card p-4 ${s.color}`}>
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-sm font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">เพิ่มการเข้างานด้วยตนเอง</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">พนักงาน *</label>
                <select className="input-field" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required>
                  <option value="">-- เลือกพนักงาน --</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_type === 'kitchen' ? 'ครัว' : 'ขาย'})</option>)}
                </select>
              </div>
              <div>
                <label className="label">วันที่ *</label>
                <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="label">เวลาเช็คอิน</label>
                <input type="time" className="input-field" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
              </div>
              <div>
                <label className="label">เวลาเช็คเอาต์</label>
                <input type="time" className="input-field" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
              </div>
              <div>
                <label className="label">สถานะ</label>
                <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="present">มาทำงาน</option>
                  <option value="late">มาสาย</option>
                  <option value="half">ครึ่งวัน</option>
                  <option value="absent">ขาดงาน</option>
                </select>
              </div>
              <div>
                <label className="label">หมายเหตุ</label>
                <input type="text" className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="หมายเหตุ (ถ้ามี)" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">ยกเลิก</button>
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </form>
        </div>
      )}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p>ไม่มีข้อมูลการเข้างานวันที่ {date}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">ชื่อ</th><th className="table-header">ประเภท</th>
                  <th className="table-header">เช็คอิน</th><th className="table-header">เช็คเอาต์</th>
                  <th className="table-header">ชั่วโมง</th><th className="table-header">OT</th>
                  <th className="table-header">จุดขาย</th><th className="table-header">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{rec.employee_name}</td>
                    <td className="table-cell"><EmployeeTypeTag type={rec.employee_type} /></td>
                    <td className="table-cell font-mono"><div className="flex items-center gap-1">{rec.check_in ? rec.check_in.substring(11, 16) : '-'}{getMethodBadge(rec.check_in_method)}</div></td>
                    <td className="table-cell font-mono"><div className="flex items-center gap-1">{rec.check_out ? rec.check_out.substring(11, 16) : '-'}{getMethodBadge(rec.check_out_method)}</div></td>
                    <td className="table-cell">{rec.regular_hours > 0 ? `${rec.regular_hours.toFixed(1)} ชม.` : '-'}</td>
                    <td className="table-cell">{rec.ot_hours > 0 ? <span className="text-orange-600 font-medium">{rec.ot_hours.toFixed(1)} ชม.</span> : '-'}</td>
                    <td className="table-cell text-gray-500 text-sm">{rec.sales_point_name || '-'}</td>
                    <td className="table-cell"><span className={`badge-${rec.status}`}>{getStatusLabel(rec.status)}</span></td>
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
