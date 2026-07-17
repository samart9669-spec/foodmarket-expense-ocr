'use client'

export const runtime = 'edge'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Employee { id: string; name: string; employee_type: string }

export default function EmployeeOffsitePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState({
    employee_id: '', date: '', location_name: '', latitude: '', longitude: '', reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetch('/api/employees').then(r => r.json()).then((d: any) => setEmployees(d.employees || []))
    setForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] }))
  }, [])

  // Close the dropdown when clicking outside the picker
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Case-insensitive search; empty search shows the full list
  const q = search.trim().toLowerCase()
  const filtered = q ? employees.filter(e => e.name.toLowerCase().includes(q)) : employees
  const selectedEmp = employees.find(e => e.id === form.employee_id)

  const getGps = () => {
    if (!navigator.geolocation) { setResult({ success: false, message: 'เบราว์เซอร์ไม่รองรับ GPS' }); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          latitude: String(pos.coords.latitude.toFixed(6)),
          longitude: String(pos.coords.longitude.toFixed(6)),
        }))
        setGpsLoading(false)
      },
      () => { setResult({ success: false, message: 'ไม่สามารถดึงพิกัด GPS ได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง' }); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.employee_id) { setResult({ success: false, message: 'กรุณาเลือกชื่อพนักงาน' }); return }
    if (!form.date) { setResult({ success: false, message: 'กรุณาเลือกวันที่' }); return }
    if (!form.location_name.trim()) { setResult({ success: false, message: 'กรุณาระบุชื่อสถานที่ปฏิบัติงาน' }); return }
    if (!form.latitude || !form.longitude) { setResult({ success: false, message: 'กรุณาแนบพิกัด GPS ของสถานที่ (กดปุ่มดึงพิกัด)' }); return }

    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/offsite-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: form.employee_id,
          date: form.date,
          location_name: form.location_name.trim(),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          reason: form.reason.trim() || undefined,
        }),
      })
      const data = await res.json() as any
      setResult({ success: res.ok, message: data.message || data.error })
      if (res.ok) setForm(f => ({ ...f, employee_id: '', location_name: '', latitude: '', longitude: '', reason: '' }))
    } catch {
      setResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
        <Link href="/employee" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold">ขอปฏิบัติงานนอกสถานที่</h1>
          <p className="text-gray-500 text-xs">แนบพิกัดสถานที่ · เมื่ออนุมัติแล้วจะเช็คอิน/เอาต์ที่นั่นได้เฉพาะวันดังกล่าว</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-4 py-5 space-y-5 max-w-md mx-auto w-full">
        {result && (
          <div className={`p-4 rounded-xl border-2 text-center font-medium ${
            result.success ? 'bg-green-900/50 border-green-600 text-green-300' : 'bg-red-900/50 border-red-600 text-red-300'
          }`}>
            {result.message}
          </div>
        )}

        {/* Employee picker */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">ชื่อพนักงาน *</label>
          {selectedEmp ? (
            <div className="flex items-center justify-between bg-purple-900/40 border border-purple-600 rounded-xl px-4 py-3">
              <p className="font-semibold">{selectedEmp.name}</p>
              <button type="button" onClick={() => setForm(f => ({ ...f, employee_id: '' }))}
                className="text-sm text-gray-400 hover:text-white">เปลี่ยน</button>
            </div>
          ) : (
            <div ref={pickerRef}>
              <div className="relative">
                <input
                  type="text"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  placeholder="แตะเพื่อเลือกรายชื่อ หรือพิมพ์ค้นหา..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => setDropdownOpen(true)}
                />
                <svg className="w-5 h-5 text-gray-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {dropdownOpen && (
                <div className="mt-2 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="px-4 py-3 text-gray-500 text-sm">ไม่พบพนักงาน</p>
                  ) : filtered.map(emp => (
                    <button key={emp.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, employee_id: emp.id })); setSearch(''); setDropdownOpen(false) }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-800 border-b border-gray-800 last:border-0 transition-colors">
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">วันที่ปฏิบัติงาน *</label>
          <input type="date" min={today} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
            value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">ชื่อสถานที่ปฏิบัติงาน *</label>
          <input type="text" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            placeholder="เช่น ไซต์งานลูกค้า ABC, งานออกบูธเซ็นทรัล..."
            value={form.location_name} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} />
        </div>

        {/* GPS */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400">พิกัดสถานที่ (Location) *</label>
            <button type="button" onClick={getGps} disabled={gpsLoading}
              className="text-sm px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {gpsLoading ? 'กำลังดึง...' : 'ดึงพิกัดปัจจุบัน'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.000001" placeholder="Latitude"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} />
            <input type="number" step="0.000001" placeholder="Longitude"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500"
              value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} />
          </div>
          {form.latitude && form.longitude ? (
            <p className="text-xs text-green-400">✓ แนบพิกัดแล้ว — เช็คอินได้ภายในรัศมี 300 เมตรจากจุดนี้</p>
          ) : (
            <p className="text-xs text-gray-500">ถ้าอยู่ที่สถานที่ปฏิบัติงานแล้ว กด "ดึงพิกัดปัจจุบัน" หรือกรอกพิกัดเอง</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">เหตุผล/รายละเอียดงาน</label>
          <textarea rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
            placeholder="เช่น ติดตั้งระบบให้ลูกค้า, ประชุมนอกสถานที่..."
            value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl font-bold text-lg transition-colors">
          {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขออนุมัติ'}
        </button>
      </form>
    </div>
  )
}
