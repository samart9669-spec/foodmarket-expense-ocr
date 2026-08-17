'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Employee { id: string; name: string; employee_type: string }

const LEAVE_TYPES = [
  { value: 'sick', label: 'ลาป่วย', color: 'bg-red-700' },
  { value: 'annual', label: 'ลาพักร้อน', color: 'bg-blue-700' },
  { value: 'personal', label: 'ลากิจ', color: 'bg-purple-700' },
  { value: 'emergency', label: 'ลาฉุกเฉิน', color: 'bg-orange-700' },
]

export default function EmployeeLeavePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState({
    employee_id: '', date_start: '', date_end: '', leave_type: 'sick', reason: '',
    leave_unit: 'day' as 'day' | 'hour', start_time: '09:00', end_time: '12:00',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [search, setSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetch('/api/employees').then(r => r.json()).then((d: any) => setEmployees(d.employees || []))
  }, [])

  const filtered = employees.filter(e => e.name.includes(search))

  // Hours covered by a part-day request; null until both times are set
  const hourCount = (() => {
    if (form.leave_unit !== 'hour' || !form.start_time || !form.end_time) return null
    const [sh, sm] = form.start_time.split(':').map(Number)
    const [eh, em] = form.end_time.split(':').map(Number)
    if ([sh, sm, eh, em].some(Number.isNaN)) return null
    return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employee_id) { setResult({ success: false, message: 'กรุณาเลือกชื่อพนักงาน' }); return }
    if (form.leave_unit === 'hour') {
      if (!form.date_start) { setResult({ success: false, message: 'กรุณาเลือกวันที่' }); return }
      if (!form.start_time || !form.end_time) { setResult({ success: false, message: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด' }); return }
      if (hourCount == null || hourCount <= 0) { setResult({ success: false, message: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' }); return }
    } else {
      if (!form.date_start || !form.date_end) { setResult({ success: false, message: 'กรุณาเลือกวันที่' }); return }
      if (form.date_end < form.date_start) { setResult({ success: false, message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น' }); return }
    }

    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as any
      setResult({ success: res.ok, message: data.message || data.error })
      if (res.ok) setForm(f => ({ ...f, employee_id: '', date_start: '', date_end: '', reason: '' }))
    } catch {
      setResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setSubmitting(false)
    }
  }

  const selectedEmp = employees.find(e => e.id === form.employee_id)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4">
        <Link href="/employee" className="p-2 bg-gray-800 rounded-xl">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">ขอลางาน</h1>
      </div>

      <div className="flex-1 px-4 pb-10 max-w-lg mx-auto w-full">
        {result && (
          <div className={`mb-4 rounded-2xl p-4 text-center border-2 ${result.success ? 'bg-green-900 border-green-500' : 'bg-red-900 border-red-500'}`}>
            <p className={`font-semibold text-lg ${result.success ? 'text-green-300' : 'text-red-300'}`}>{result.message}</p>
            {result.success && <p className="text-gray-300 text-sm mt-1">ผู้จัดการจะแจ้งผลการอนุมัติ</p>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee selector */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            <p className="font-semibold text-gray-200">เลือกชื่อพนักงาน *</p>
            <input
              type="text"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 placeholder-gray-500"
              placeholder="ค้นหาชื่อ..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filtered.length === 0
                  ? <p className="text-gray-500 text-sm text-center py-2">ไม่พบชื่อที่ค้นหา</p>
                  : filtered.map(emp => (
                    <button key={emp.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, employee_id: emp.id })); setSearch('') }}
                      className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${form.employee_id === emp.id ? 'bg-blue-700' : 'bg-gray-800 hover:bg-gray-700'}`}>
                      <span className="font-medium">{emp.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{emp.employee_type === 'kitchen' ? 'ครัวกลาง' : 'พนักงานขาย'}</span>
                    </button>
                  ))
                }
              </div>
            )}
            {selectedEmp && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-900 rounded-xl border border-blue-600">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                <span className="font-semibold">{selectedEmp.name}</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, employee_id: '' }))} className="ml-auto text-gray-400 hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
          </div>

          {/* Leave type */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            <p className="font-semibold text-gray-200">ประเภทการลา *</p>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPES.map(lt => (
                <button key={lt.value} type="button"
                  onClick={() => setForm(f => ({ ...f, leave_type: lt.value }))}
                  className={`py-3 rounded-xl font-medium transition-colors ${form.leave_type === lt.value ? lt.color + ' text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {lt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full-day or part-day */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            <p className="font-semibold text-gray-200">รูปแบบการลา *</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: 'day', label: 'ลาเต็มวัน', hint: 'ระบุช่วงวันที่' },
                { v: 'hour', label: 'ลาเป็นชั่วโมง', hint: 'ลาบางช่วงของวัน' },
              ] as const).map(o => (
                <button key={o.v} type="button"
                  onClick={() => setForm(f => ({ ...f, leave_unit: o.v }))}
                  className={`rounded-xl px-3 py-3 text-left border-2 transition-colors ${
                    form.leave_unit === o.v ? 'border-orange-500 bg-orange-900/40' : 'border-gray-700 bg-gray-800'
                  }`}>
                  <p className="font-semibold text-sm">{o.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{o.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Dates / times */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            <p className="font-semibold text-gray-200">{form.leave_unit === 'hour' ? 'วันและเวลาที่ลา *' : 'วันที่ลา *'}</p>

            {form.leave_unit === 'hour' ? (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">วันที่</label>
                  <input type="date" min={today}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5"
                    value={form.date_start}
                    onChange={e => setForm(f => ({ ...f, date_start: e.target.value, date_end: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">เวลาเริ่ม</label>
                    <input type="time"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5"
                      value={form.start_time}
                      onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">เวลาสิ้นสุด</label>
                    <input type="time"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5"
                      value={form.end_time}
                      onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
                  </div>
                </div>
                {hourCount != null && (
                  <p className={`text-sm ${hourCount > 0 ? 'text-orange-300' : 'text-red-400'}`}>
                    {hourCount > 0 ? `รวม ${hourCount} ชั่วโมง` : 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม'}
                  </p>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">วันเริ่มต้น</label>
                  <input type="date" min={today}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5"
                    value={form.date_start}
                    onChange={e => setForm(f => ({ ...f, date_start: e.target.value, date_end: f.date_end < e.target.value ? e.target.value : f.date_end }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">วันสิ้นสุด</label>
                  <input type="date" min={form.date_start || today}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5"
                    value={form.date_end}
                    onChange={e => setForm(f => ({ ...f, date_end: e.target.value }))} />
                </div>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-2">
            <p className="font-semibold text-gray-200">เหตุผล (ไม่บังคับ)</p>
            <textarea
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 placeholder-gray-500 resize-none"
              placeholder="ระบุเหตุผลการลา..."
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 rounded-2xl font-bold text-lg transition-colors">
            {submitting ? 'กำลังส่ง...' : 'ส่งคำขอลา'}
          </button>
        </form>
      </div>
    </div>
  )
}
