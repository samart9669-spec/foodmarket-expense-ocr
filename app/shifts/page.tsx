'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'

interface Shift {
  id: string
  name: string
  start_time: string
  end_time: string
  regular_hours: number
  break_minutes: number
}

const emptyForm = { name: '', start_time: '08:00', end_time: '17:00', regular_hours: 8, break_minutes: 60 }

function calcHours(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return Math.round((mins / 60) * 10) / 10
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const fetchShifts = async () => {
    setLoading(true)
    const res = await fetch('/api/shifts')
    const data = await res.json() as any
    setShifts(data.shifts || [])
    setLoading(false)
  }

  useEffect(() => { fetchShifts() }, [])

  const updateHours = (start: string, end: string) => {
    setForm((f) => ({ ...f, start_time: start, end_time: end, regular_hours: calcHours(start, end) }))
  }

  const openAdd = () => {
    setEditId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  const openEdit = (s: Shift) => {
    setEditId(s.id)
    setForm({ name: s.name, start_time: s.start_time, end_time: s.end_time, regular_hours: s.regular_hours, break_minutes: s.break_minutes ?? 60 })
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('กรุณากรอกชื่อกะ'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/shifts', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...form, id: editId } : form),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      setSuccess(editId ? 'แก้ไขกะงานสำเร็จ' : 'เพิ่มกะงานสำเร็จ')
      setShowForm(false)
      await fetchShifts()
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ลบกะ "${name}" ใช่ไหม?`)) return
    try {
      const res = await fetch(`/api/shifts?id=${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('ลบไม่สำเร็จ'); return }
      setSuccess('ลบกะงานแล้ว')
      await fetchShifts()
    } catch {
      setError('เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ตั้งค่ากะงาน</h1>
          <p className="text-gray-500 text-sm mt-1">กำหนดเวลาเข้า-ออกของแต่ละกะ</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          เพิ่มกะงาน
        </button>
      </div>

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
      )}
      {error && !showForm && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="card space-y-4 border-2 border-blue-200">
          <h2 className="font-semibold text-gray-900">{editId ? 'แก้ไขกะงาน' : 'เพิ่มกะงานใหม่'}</h2>

          <div>
            <label className="label">ชื่อกะ *</label>
            <input
              type="text"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น กะเช้า, กะบ่าย, กะดึก"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">เวลาเข้างาน *</label>
              <input
                type="time"
                className="input-field"
                value={form.start_time}
                onChange={(e) => updateHours(e.target.value, form.end_time)}
              />
            </div>
            <div>
              <label className="label">เวลาออกงาน *</label>
              <input
                type="time"
                className="input-field"
                value={form.end_time}
                onChange={(e) => updateHours(form.start_time, e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">ชั่วโมงทำงานปกติ</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input-field w-32"
                value={form.regular_hours}
                onChange={(e) => setForm({ ...form, regular_hours: Number(e.target.value) })}
                min={1}
                max={24}
                step="any"
              />
              <span className="text-sm text-gray-500">ชั่วโมง (คำนวณอัตโนมัติจากเวลาเข้า-ออก)</span>
            </div>
          </div>

          <div>
            <label className="label">เวลาพัก (นาที)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                className="input-field w-32"
                value={form.break_minutes}
                onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })}
                min={0}
                max={120}
                step="any"
              />
              <span className="text-sm text-gray-500">นาที</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p>เวลาเกินกว่า <strong>{form.regular_hours} ชั่วโมง</strong> จะนับเป็น OT โดยอัตโนมัติ</p>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }} className="btn-secondary">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Shift list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : shifts.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p>ยังไม่มีกะงาน กดเพิ่มกะงานด้านบน</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shifts.map((s) => (
            <div key={s.id} className="card flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{s.name}</p>
                <p className="text-sm text-gray-500">
                  {s.start_time} – {s.end_time}
                  <span className="ml-2 text-blue-600 font-medium">({s.regular_hours} ชม.)</span>
                  <span className="ml-2 text-gray-400">พัก {s.break_minutes ?? 60} นาที</span>
                </p>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => openEdit(s)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="แก้ไข"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.name)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="ลบ"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
