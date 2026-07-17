'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'

interface Branch {
  id: string
  name: string
  location: string
  latitude: number | null
  longitude: number | null
  radius_meters: number
}

const DEFAULT_RADIUS = 200

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', location: '', latitude: '', longitude: '', radius_meters: String(DEFAULT_RADIUS) })
  const [gpsLoading, setGpsLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Head office (separate from sales points)
  const [hqForm, setHqForm] = useState({ address: '', latitude: '', longitude: '', radius_meters: String(DEFAULT_RADIUS) })
  const [hqEditing, setHqEditing] = useState(false)
  const [hqSaving, setHqSaving] = useState(false)
  const [hqGpsLoading, setHqGpsLoading] = useState(false)
  const [hqLoaded, setHqLoaded] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchBranches = () => {
    setLoading(true)
    fetch('/api/sales-points')
      .then(r => r.json())
      .then((d: any) => setBranches(d.salesPoints || []))
      .finally(() => setLoading(false))
  }

  const fetchHeadOffice = () => {
    fetch('/api/head-office')
      .then(r => r.json())
      .then((d: any) => {
        setHqForm({
          address: d.address || '',
          latitude: d.latitude != null ? String(d.latitude) : '',
          longitude: d.longitude != null ? String(d.longitude) : '',
          radius_meters: String(d.radius_meters || DEFAULT_RADIUS),
        })
        setHqLoaded(true)
      })
      .catch(() => setHqLoaded(true))
  }

  useEffect(() => { fetchBranches(); fetchHeadOffice() }, [])

  const getHqGps = () => {
    if (!navigator.geolocation) { showToast('เบราว์เซอร์ไม่รองรับ GPS'); return }
    setHqGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setHqForm(f => ({ ...f, latitude: String(pos.coords.latitude.toFixed(6)), longitude: String(pos.coords.longitude.toFixed(6)) }))
        setHqGpsLoading(false)
      },
      () => { showToast('ไม่สามารถดึง GPS ได้'); setHqGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSaveHq = async () => {
    setHqSaving(true)
    try {
      const res = await fetch('/api/head-office', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: hqForm.address.trim(),
          latitude: hqForm.latitude ? parseFloat(hqForm.latitude) : null,
          longitude: hqForm.longitude ? parseFloat(hqForm.longitude) : null,
          radius_meters: parseInt(hqForm.radius_meters) || DEFAULT_RADIUS,
        }),
      })
      if (res.ok) {
        showToast('บันทึกพิกัดสำนักงานใหญ่แล้ว')
        setHqEditing(false)
      } else {
        const d = await res.json() as any
        showToast(d.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setHqSaving(false)
    }
  }

  const resetForm = () => setForm({ name: '', location: '', latitude: '', longitude: '', radius_meters: String(DEFAULT_RADIUS) })

  const startCreate = () => {
    resetForm()
    setEditing(null)
    setCreating(true)
  }

  const startEdit = (b: Branch) => {
    setCreating(false)
    setEditing(b)
    setForm({
      name: b.name,
      location: b.location || '',
      latitude: b.latitude != null ? String(b.latitude) : '',
      longitude: b.longitude != null ? String(b.longitude) : '',
      radius_meters: String(b.radius_meters || DEFAULT_RADIUS),
    })
  }

  const getGps = () => {
    if (!navigator.geolocation) { showToast('เบราว์เซอร์ไม่รองรับ GPS'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({ ...f, latitude: String(pos.coords.latitude.toFixed(6)), longitude: String(pos.coords.longitude.toFixed(6)) }))
        setGpsLoading(false)
      },
      () => { showToast('ไม่สามารถดึง GPS ได้'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('กรุณากรอกชื่อสาขา'); return }
    setSaving(true)
    try {
      const body = {
        ...(editing ? { id: editing.id } : {}),
        name: form.name.trim(),
        location: form.location.trim() || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        radius_meters: parseInt(form.radius_meters) || DEFAULT_RADIUS,
      }
      const res = await fetch('/api/sales-points', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast(editing ? 'บันทึกแล้ว' : 'เพิ่มสาขาแล้ว')
        setEditing(null)
        setCreating(false)
        fetchBranches()
      } else {
        const d = await res.json() as any
        showToast(d.error || 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบสาขานี้?')) return
    setDeleting(id)
    try {
      await fetch(`/api/sales-points?id=${id}`, { method: 'DELETE' })
      fetchBranches()
    } finally {
      setDeleting(null)
    }
  }

  const isFormOpen = creating || editing !== null

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white px-5 py-3 rounded-xl shadow-lg font-medium animate-pulse">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">จัดการสาขา</h1>
        <button onClick={startCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          เพิ่มสาขา
        </button>
      </div>

      {/* Head office — separate from sales points */}
      <div className="bg-gray-800 rounded-xl p-5 border border-purple-700 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <div>
              <p className="font-semibold text-gray-100 text-lg">สำนักงานใหญ่ (Head Office)</p>
              <p className="text-gray-400 text-xs">ใช้ตรวจตำแหน่งเช็คอินสำหรับพนักงานที่ไม่สังกัดจุดขาย เช่น ครัวกลาง</p>
            </div>
          </div>
          {!hqEditing && (
            <button onClick={() => setHqEditing(true)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
          )}
        </div>

        {!hqEditing ? (
          hqLoaded && (hqForm.latitude && hqForm.longitude ? (
            <div className="flex items-center gap-2 bg-purple-900/30 border border-purple-700 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <div>
                <p className="text-purple-300 text-xs font-medium">GPS เปิดใช้งาน · รัศมี {hqForm.radius_meters} ม.</p>
                <p className="text-purple-400 text-xs">{parseFloat(hqForm.latitude).toFixed(5)}, {parseFloat(hqForm.longitude).toFixed(5)}</p>
                {hqForm.address && <p className="text-gray-400 text-xs mt-0.5">{hqForm.address}</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-gray-500 text-xs">ยังไม่ได้ตั้งพิกัดสำนักงานใหญ่ — พนักงานที่ไม่สังกัดจุดขายจะไม่ถูกตรวจตำแหน่ง</p>
            </div>
          ))
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">ที่อยู่/รายละเอียด</label>
              <input
                type="text"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 placeholder-gray-500"
                placeholder="ที่อยู่สำนักงานใหญ่..."
                value={hqForm.address}
                onChange={e => setHqForm(f => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">พิกัด GPS</label>
              <button onClick={getHqGps} disabled={hqGpsLoading}
                className="text-sm px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {hqGpsLoading ? 'กำลังดึง...' : 'ดึงพิกัดปัจจุบัน'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500"
                  placeholder="13.756331"
                  value={hqForm.latitude}
                  onChange={e => setHqForm(f => ({ ...f, latitude: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500"
                  placeholder="100.501765"
                  value={hqForm.longitude}
                  onChange={e => setHqForm(f => ({ ...f, longitude: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">รัศมี (เมตร)</label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
                  value={hqForm.radius_meters}
                  onChange={e => setHqForm(f => ({ ...f, radius_meters: e.target.value }))}
                />
              </div>
            </div>
            {!hqForm.latitude && !hqForm.longitude && (
              <p className="text-xs text-gray-500">เว้นว่างพิกัด = ปิดการตรวจตำแหน่งสำนักงานใหญ่</p>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={handleSaveHq} disabled={hqSaving}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                {hqSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => { setHqEditing(false); fetchHeadOffice() }}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors">
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-gray-800 rounded-xl p-6 space-y-4 border border-blue-600">
          <h2 className="text-lg font-semibold text-gray-100">{editing ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm text-gray-400 mb-1">ชื่อสาขา *</label>
              <input
                type="text"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 placeholder-gray-500"
                placeholder="เช่น สาขาหน้าตลาด"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-sm text-gray-400 mb-1">ที่อยู่/รายละเอียด</label>
              <input
                type="text"
                className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 placeholder-gray-500"
                placeholder="ที่อยู่สาขา..."
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">พิกัด GPS (สำหรับยืนยันตำแหน่งเช็คอิน)</label>
              <button onClick={getGps} disabled={gpsLoading}
                className="text-sm px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {gpsLoading ? 'กำลังดึง...' : 'ดึงพิกัดปัจจุบัน'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500"
                  placeholder="13.756331"
                  value={form.latitude}
                  onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.000001"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500"
                  placeholder="100.501765"
                  value={form.longitude}
                  onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">รัศมี (เมตร)</label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
                  value={form.radius_meters}
                  onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))}
                />
              </div>
            </div>
            {form.latitude && form.longitude && (
              <p className="text-xs text-green-400">GPS ตั้งค่าแล้ว — พนักงานต้องเช็คอินภายในรัศมี {form.radius_meters} เมตร</p>
            )}
            {!form.latitude && !form.longitude && (
              <p className="text-xs text-gray-500">ถ้าไม่ตั้ง GPS จะไม่มีการตรวจสอบตำแหน่ง</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button onClick={() => { setEditing(null); setCreating(false) }}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition-colors">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : branches.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-500">ยังไม่มีสาขา กด "เพิ่มสาขา" เพื่อเริ่มต้น</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map(b => (
            <div key={b.id} className="bg-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-100 text-lg">{b.name}</p>
                  {b.location && <p className="text-gray-400 text-sm mt-0.5">{b.location}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(b)} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(b.id)} disabled={deleting === b.id} className="p-2 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded-lg transition-colors">
                    <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              {b.latitude != null && b.longitude != null ? (
                <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <div>
                    <p className="text-green-300 text-xs font-medium">GPS เปิดใช้งาน · รัศมี {b.radius_meters} ม.</p>
                    <p className="text-green-500 text-xs">{b.latitude?.toFixed(5)}, {b.longitude?.toFixed(5)}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-700/50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <p className="text-gray-500 text-xs">ยังไม่ได้ตั้ง GPS — ไม่มีการตรวจสอบตำแหน่ง</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
