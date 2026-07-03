'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'

interface OffsiteRequest {
  id: string
  employee_id: string
  employee_name: string
  date: string
  location_name: string
  latitude: number
  longitude: number
  radius_meters: number
  reason: string | null
  status: string
  admin_note: string | null
  created_at: string
}

export default function AdminOffsitePage() {
  const [requests, setRequests] = useState<OffsiteRequest[]>([])
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteId, setNoteId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchRequests = () => {
    setLoading(true)
    const q = filter === 'all' ? '' : `?status=${filter}`
    fetch(`/api/offsite-requests${q}`)
      .then(r => r.json())
      .then((d: any) => setRequests(d.offsiteRequests || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRequests() }, [filter])

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setActionId(id)
    try {
      const res = await fetch('/api/offsite-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_note: noteId === id ? note : '' }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (res.ok) {
        showToast(status === 'approved' ? 'อนุมัติแล้ว — พนักงานเช็คอินที่สถานที่นี้ได้ในวันดังกล่าว' : 'ไม่อนุมัติคำขอแล้ว', true)
        setNoteId(null)
        setNote('')
        fetchRequests()
      } else {
        showToast(data.error || `บันทึกไม่สำเร็จ (HTTP ${res.status})`, false)
      }
    } catch {
      showToast('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่', false)
    } finally {
      setActionId(null)
    }
  }

  const statusBadge = (s: string) => ({
    pending: 'bg-yellow-800 text-yellow-200',
    approved: 'bg-green-800 text-green-200',
    rejected: 'bg-red-800 text-red-200',
  }[s] || 'bg-gray-700 text-gray-200')

  const statusLabel = (s: string) => ({ pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' }[s] || s)

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-100">อนุมัติปฏิบัติงานนอกสถานที่</h1>
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {f === 'pending' ? 'รออนุมัติ' : f === 'approved' ? 'อนุมัติแล้ว' : f === 'rejected' ? 'ไม่อนุมัติ' : 'ทั้งหมด'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-500">ไม่มีคำขอปฏิบัติงานนอกสถานที่</div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-100 text-lg">{req.employee_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
                  </div>
                  <p className="text-gray-300 text-sm mt-1.5 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    วันที่ {req.date}
                  </p>
                  <p className="text-gray-300 text-sm mt-1 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {req.location_name}
                    <a href={`https://www.google.com/maps?q=${req.latitude},${req.longitude}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline text-xs ml-1">
                      เปิดแผนที่ ({req.latitude.toFixed(5)}, {req.longitude.toFixed(5)})
                    </a>
                  </p>
                  {req.reason && <p className="text-gray-500 text-sm mt-1">เหตุผล: {req.reason}</p>}
                  {req.admin_note && <p className="text-blue-400 text-sm mt-0.5">หมายเหตุ: {req.admin_note}</p>}
                  <p className="text-gray-600 text-xs mt-1">ยื่นเมื่อ {new Date(req.created_at).toLocaleDateString('th-TH')}</p>
                </div>
              </div>

              {req.status === 'pending' && (
                <div className="space-y-2 pt-1 border-t border-gray-700">
                  {noteId === req.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm placeholder-gray-500"
                        placeholder="หมายเหตุ (ไม่บังคับ)..."
                        value={note}
                        onChange={e => setNote(e.target.value)}
                      />
                      <button onClick={() => { setNoteId(null); setNote('') }} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">ยกเลิก</button>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <button
                      disabled={actionId === req.id}
                      onClick={() => handleAction(req.id, 'approved')}
                      className="flex-1 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors">
                      {actionId === req.id ? '...' : 'อนุมัติ'}
                    </button>
                    <button
                      disabled={actionId === req.id}
                      onClick={() => noteId === req.id ? handleAction(req.id, 'rejected') : setNoteId(req.id)}
                      className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition-colors">
                      {actionId === req.id ? '...' : noteId === req.id ? 'ยืนยันไม่อนุมัติ' : 'ไม่อนุมัติ'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
