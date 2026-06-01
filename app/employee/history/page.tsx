'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Employee { id: string; name: string }

export default function EmployeeHistoryPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [attendance, setAttendance] = useState<any[]>([])
  const [leaves, setLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/employees').then(r => r.json()).then((d: any) => setEmployees(d.employees || []))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    Promise.all([
      fetch(`/api/attendance?employee_id=${selectedId}`).then(r => r.json()),
      fetch(`/api/leave-requests?employee_id=${selectedId}`).then(r => r.json()),
    ]).then(([a, l]: any) => {
      setAttendance(a.attendance || [])
      setLeaves(l.leaveRequests || [])
    }).finally(() => setLoading(false))
  }, [selectedId])

  const filtered = employees.filter(e => e.name.includes(search))
  const selected = employees.find(e => e.id === selectedId)

  const leaveLabel = (t: string) => ({ sick: 'ลาป่วย', annual: 'ลาพักร้อน', personal: 'ลากิจ', emergency: 'ลาฉุกเฉิน' }[t] || t)
  const statusColor = (s: string) => ({ pending: 'text-yellow-400', approved: 'text-green-400', rejected: 'text-red-400' }[s] || 'text-gray-400')
  const statusLabel = (s: string) => ({ pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ' }[s] || s)

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4">
        <Link href="/employee" className="p-2 bg-gray-800 rounded-xl">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <h1 className="text-lg font-bold">ประวัติการทำงาน</h1>
      </div>

      <div className="flex-1 px-4 pb-10 max-w-lg mx-auto w-full space-y-4">
        {/* Employee selector */}
        <div className="bg-gray-900 rounded-2xl p-4 space-y-2">
          {selected ? (
            <div className="flex items-center gap-3">
              <span className="font-semibold text-lg">{selected.name}</span>
              <button onClick={() => { setSelectedId(''); setSearch(''); setAttendance([]); setLeaves([]) }}
                className="ml-auto text-gray-500 hover:text-white text-sm">เปลี่ยน</button>
            </div>
          ) : (
            <>
              <input type="text" className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 placeholder-gray-500"
                placeholder="ค้นหาชื่อพนักงาน..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && (
                <div className="max-h-48 overflow-y-auto space-y-1 mt-1">
                  {filtered.map(emp => (
                    <button key={emp.id} type="button" onClick={() => { setSelectedId(emp.id); setSearch('') }}
                      className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-medium">
                      {emp.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {loading && <div className="text-center py-6"><div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}

        {selectedId && !loading && (
          <>
            {/* Attendance history */}
            <div className="bg-gray-900 rounded-2xl p-4">
              <h2 className="font-semibold text-gray-200 mb-3">บันทึกเวลา (30 วันล่าสุด)</h2>
              {attendance.length === 0
                ? <p className="text-gray-500 text-sm text-center py-4">ยังไม่มีบันทึก</p>
                : <div className="space-y-2">
                    {attendance.slice(0, 30).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.date}</p>
                          <p className="text-xs text-gray-400">
                            เข้า {a.check_in?.slice(11, 16) || '—'} · ออก {a.check_out?.slice(11, 16) || '—'}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          a.status === 'late' ? 'bg-yellow-900 text-yellow-300' :
                          a.status === 'absent' ? 'bg-red-900 text-red-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {a.status === 'late' ? 'มาสาย' : a.status === 'absent' ? 'ขาด' : 'ปกติ'}
                        </span>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Leave history */}
            <div className="bg-gray-900 rounded-2xl p-4">
              <h2 className="font-semibold text-gray-200 mb-3">ประวัติการลา</h2>
              {leaves.length === 0
                ? <p className="text-gray-500 text-sm text-center py-4">ยังไม่มีประวัติการลา</p>
                : <div className="space-y-2">
                    {leaves.map((l: any) => (
                      <div key={l.id} className="py-2 border-b border-gray-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{leaveLabel(l.leave_type)}</span>
                          <span className={`text-xs font-medium ${statusColor(l.status)}`}>· {statusLabel(l.status)}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{l.date_start} → {l.date_end}</p>
                        {l.reason && <p className="text-xs text-gray-500 mt-0.5">{l.reason}</p>}
                      </div>
                    ))}
                  </div>
              }
            </div>
          </>
        )}
      </div>
    </div>
  )
}
