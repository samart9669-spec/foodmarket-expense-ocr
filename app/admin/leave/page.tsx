'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'

interface LeaveRequest {
  id: string
  employee_id: string
  employee_name: string
  leave_type: string
  date_start: string
  date_end: string
  reason: string
  status: string
  admin_note: string
  created_at: string
  leave_unit: string | null
  start_time: string | null
  end_time: string | null
  hours: number | null
}

const leaveLabel = (t: string) => ({ sick: 'ลาป่วย', annual: 'ลาพักร้อน', personal: 'ลากิจ', emergency: 'ลาฉุกเฉิน' }[t] || t)
const leaveColor = (t: string) => ({ sick: 'bg-red-800 text-red-200', annual: 'bg-blue-800 text-blue-200', personal: 'bg-purple-800 text-purple-200', emergency: 'bg-orange-800 text-orange-200' }[t] || 'bg-gray-700 text-gray-200')

export default function AdminLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
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
    fetch(`/api/leave-requests${q}`)
      .then(r => r.json())
      .then((d: any) => setRequests(d.leaveRequests || []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRequests() }, [filter])

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setActionId(id)
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_note: noteId === id ? note : '' }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (res.ok) {
        showToast(status === 'approved' ? 'อนุมัติใบลาแล้ว' : 'ไม่อนุมัติใบลาแล้ว', true)
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">อนุมัติใบลา</h1>
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {f === 'pending' ? 'รออนุมัติ' : f === 'approved' ? 'อนุมัติแล้ว' : f === 'rejected' ? 'ไม่อนุมัติ' : 'ทั้งหมด'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-500">ไม่มีรายการใบลา</div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-100 text-lg">{req.employee_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leaveColor(req.leave_type)}`}>{leaveLabel(req.leave_type)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(req.status)}`}>{statusLabel(req.status)}</span>
                  </div>
                  {req.leave_unit === 'hour' ? (
                    <p className="text-gray-400 text-sm mt-1">
                      {req.date_start} · {req.start_time}–{req.end_time}
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-900 text-orange-200 font-medium">
                        ลารายชั่วโมง {req.hours} ชม.
                      </span>
                    </p>
                  ) : (
                    <p className="text-gray-400 text-sm mt-1">{req.date_start} → {req.date_end}</p>
                  )}
                  {req.reason && <p className="text-gray-500 text-sm mt-0.5">เหตุผล: {req.reason}</p>}
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
