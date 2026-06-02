'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { formatThaiTime, getTodayString } from '@/lib/utils'
import EmployeeTypeTag from '@/components/EmployeeTypeTag'

interface Employee {
  id: string; name: string; employee_type: string
  daily_rate: number; is_active: number
  face_photo: string | null; qr_code: string | null
}
interface AttendanceRecord {
  id: string; employee_id: string; employee_name: string
  date: string; check_in: string | null; check_out: string | null; status: string
}

// ── Auth helpers (client-side sessionStorage) ─────────────────────
function getToken() { return typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null }
function saveToken(t: string) { sessionStorage.setItem('adminToken', t) }
function clearToken() { sessionStorage.removeItem('adminToken') }
function authHeaders(token: string) { return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }

// ── Time conversion helpers ───────────────────────────────────────
// Convert UTC DB string → Bangkok HH:MM for display in input
function utcToThaiHHMM(utcStr: string | null): string {
  if (!utcStr) return ''
  const iso = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  const h = String(d.getUTCHours() + 7).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  // handle day overflow
  const hNum = d.getUTCHours() + 7
  return `${String(hNum % 24).padStart(2, '0')}:${m}`
}

// Convert Bangkok HH:MM + date → UTC datetime string for DB
function thaiHHMMToUtc(date: string, hhMM: string): string {
  // date is "YYYY-MM-DD", hhMM is "HH:MM" in Bangkok (UTC+7)
  const [hh, mm] = hhMM.split(':').map(Number)
  const utcHour = hh - 7
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCHours(utcHour, mm, 0, 0)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

// ── Password Modal ────────────────────────────────────────────────
function PasswordModal({ onAuth }: { onAuth: (token: string) => void }) {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'รหัสผ่านไม่ถูกต้อง'); return }
      saveToken(data.token)
      onAuth(data.token)
    } catch { setError('เกิดข้อผิดพลาด') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">เข้าสู่ระบบผู้ดูแล</h2>
          <p className="text-sm text-gray-500 mt-1">ต้องการสิทธิ์ Admin เท่านั้น</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="รหัสผ่าน Admin" autoFocus
            className="input-field text-center text-lg tracking-widest"
          />
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          <button type="submit" disabled={loading || !pw}
            className="btn-primary w-full disabled:opacity-50">
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function AdminManagePage() {
  const [token, setToken] = useState<string | null>(null)
  const [tab, setTab] = useState<'employees' | 'attendance'>('employees')

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [loadingEmp, setLoadingEmp] = useState(false)
  const [actingEmp, setActingEmp] = useState<string | null>(null)

  // Attendance state
  const [date, setDate] = useState(getTodayString())
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loadingAtt, setLoadingAtt] = useState(false)
  const [editing, setEditing] = useState<Record<string, { check_in: string; check_out: string }>>({})
  const [savingAtt, setSavingAtt] = useState<string | null>(null)
  const [deletingAtt, setDeletingAtt] = useState<string | null>(null)

  useEffect(() => {
    const t = getToken()
    if (t) setToken(t)
  }, [])

  // ── Load employees ──────────────────────────────────────────────
  const loadEmployees = useCallback(async (tok: string) => {
    setLoadingEmp(true)
    try {
      const url = showInactive ? '/api/employees?active=false' : '/api/employees?active=true'
      const res = await fetch(url, { headers: authHeaders(tok) })
      const data = await res.json() as any
      setEmployees(data.employees || [])
    } catch {} finally { setLoadingEmp(false) }
  }, [showInactive])

  // ── Load attendance ─────────────────────────────────────────────
  const loadAttendance = useCallback(async (tok: string) => {
    setLoadingAtt(true)
    try {
      const res = await fetch(`/api/attendance?date=${date}`, { headers: authHeaders(tok) })
      const data = await res.json() as any
      const list: AttendanceRecord[] = data.attendance || []
      setRecords(list)
      // Initialize edit state
      const init: Record<string, { check_in: string; check_out: string }> = {}
      list.forEach(r => {
        init[r.id] = {
          check_in: utcToThaiHHMM(r.check_in),
          check_out: utcToThaiHHMM(r.check_out),
        }
      })
      setEditing(init)
    } catch {} finally { setLoadingAtt(false) }
  }, [date])

  useEffect(() => {
    if (!token) return
    if (tab === 'employees') loadEmployees(token)
    else loadAttendance(token)
  }, [token, tab, showInactive, date, loadEmployees, loadAttendance])

  // ── Hard delete employee ────────────────────────────────────────
  const hardDelete = async (emp: Employee) => {
    if (!token) return
    if (!confirm(`⚠️ ลบ "${emp.name}" ออกจากระบบถาวร?\n\nการกระทำนี้จะลบข้อมูลการเข้างาน ประวัติทั้งหมดด้วย และไม่สามารถกู้คืนได้`)) return
    if (!confirm(`ยืนยันอีกครั้ง: ลบ "${emp.name}" ถาวร?`)) return
    setActingEmp(emp.id)
    try {
      await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'DELETE', headers: authHeaders(token),
      })
      setEmployees(prev => prev.filter(e => e.id !== emp.id))
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setActingEmp(null) }
  }

  // ── Save attendance time ────────────────────────────────────────
  const saveAttendance = async (record: AttendanceRecord) => {
    if (!token) return
    const edit = editing[record.id]
    if (!edit) return
    setSavingAtt(record.id)
    try {
      const body: any = {}
      if (edit.check_in) body.check_in = thaiHHMMToUtc(record.date, edit.check_in)
      if (edit.check_out) body.check_out = thaiHHMMToUtc(record.date, edit.check_out)

      const res = await fetch(`/api/admin/attendance/${record.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      if (!res.ok) { alert('บันทึกไม่สำเร็จ'); return }
      // Update record in list
      const { record: updated } = await res.json() as any
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updated } : r))
      alert('บันทึกเวลาสำเร็จ')
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setSavingAtt(null) }
  }

  // ── Delete attendance record ────────────────────────────────────
  const deleteAttendance = async (record: AttendanceRecord) => {
    if (!token) return
    if (!confirm(`ลบบันทึกเข้างานของ "${record.employee_name}" วันที่ ${record.date} ?\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return
    setDeletingAtt(record.id)
    try {
      const res = await fetch(`/api/admin/attendance/${record.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      if (!res.ok) { alert('ลบไม่สำเร็จ'); return }
      setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setDeletingAtt(null) }
  }

  const handleAuth = (tok: string) => setToken(tok)
  const handleLogout = () => { clearToken(); setToken(null) }

  return (
    <div className="space-y-6">
      {!token && <PasswordModal onAuth={handleAuth} />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            จัดการระบบ (Admin)
          </h1>
          <p className="text-gray-500 text-sm mt-1">ลบพนักงาน / แก้ไขเวลาเข้างาน</p>
        </div>
        {token && (
          <button onClick={handleLogout}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            ออกจากระบบ
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['employees', 'attendance'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'employees' ? '👤 จัดการพนักงาน' : '🕐 แก้ไขเวลาเข้างาน'}
          </button>
        ))}
      </div>

      {/* ── Employee management ── */}
      {tab === 'employees' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                className="rounded" />
              แสดงพนักงานที่ปิดใช้งาน
            </label>
          </div>

          <div className="card p-0 overflow-hidden">
            {loadingEmp ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : employees.length === 0 ? (
              <p className="text-center py-12 text-gray-400">ไม่พบพนักงาน</p>
            ) : (
              <table className="w-full">
                <thead className="bg-red-50 border-b border-red-100">
                  <tr>
                    <th className="table-header">รูป</th>
                    <th className="table-header">ชื่อ</th>
                    <th className="table-header">ประเภท</th>
                    <th className="table-header">QR Code</th>
                    <th className="table-header">สถานะ</th>
                    <th className="table-header text-red-600">ลบถาวร</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(emp => (
                    <tr key={emp.id} className={`hover:bg-gray-50 ${!emp.is_active ? 'opacity-50' : ''}`}>
                      <td className="table-cell">
                        {emp.face_photo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={emp.face_photo} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-200" />
                          : <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>}
                      </td>
                      <td className="table-cell font-medium text-gray-900">{emp.name}</td>
                      <td className="table-cell"><EmployeeTypeTag type={emp.employee_type} /></td>
                      <td className="table-cell font-mono text-xs text-gray-500">{emp.qr_code || '-'}</td>
                      <td className="table-cell">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {emp.is_active ? 'ใช้งาน' : 'ปิดแล้ว'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <button onClick={() => hardDelete(emp)} disabled={actingEmp === emp.id}
                          className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {actingEmp === emp.id ? 'กำลังลบ...' : 'ลบถาวร'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            ⚠️ <strong>การลบถาวร</strong> จะลบพนักงานและข้อมูลการเข้างานทั้งหมดออกจากระบบ ไม่สามารถกู้คืนได้
          </div>
        </div>
      )}

      {/* ── Attendance edit ── */}
      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="card">
            <label className="label">เลือกวันที่</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="input-field max-w-xs" />
          </div>

          <div className="card p-0 overflow-hidden">
            {loadingAtt ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : records.length === 0 ? (
              <p className="text-center py-12 text-gray-400">ไม่พบบันทึกการเข้างานวันนี้</p>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="table-header">พนักงาน</th>
                    <th className="table-header">สถานะ</th>
                    <th className="table-header">เวลาเข้า (ไทย)</th>
                    <th className="table-header">เวลาออก (ไทย)</th>
                    <th className="table-header">บันทึก</th>
                    <th className="table-header text-red-600">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map(rec => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-900">{rec.employee_name}</td>
                      <td className="table-cell">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          rec.status === 'present' ? 'bg-green-100 text-green-700' :
                          rec.status === 'absent' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{rec.status === 'present' ? 'มาทำงาน' : rec.status === 'absent' ? 'ขาดงาน' : rec.status}</span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <input type="time"
                            value={editing[rec.id]?.check_in || ''}
                            onChange={e => setEditing(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], check_in: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono w-28" />
                          <span className="text-xs text-gray-400">(เดิม: {formatThaiTime(rec.check_in)})</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <input type="time"
                            value={editing[rec.id]?.check_out || ''}
                            onChange={e => setEditing(prev => ({ ...prev, [rec.id]: { ...prev[rec.id], check_out: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono w-28" />
                          <span className="text-xs text-gray-400">(เดิม: {formatThaiTime(rec.check_out)})</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <button onClick={() => saveAttendance(rec)}
                          disabled={savingAtt === rec.id || deletingAtt === rec.id}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-medium disabled:opacity-50">
                          {savingAtt === rec.id ? 'บันทึก...' : 'บันทึก'}
                        </button>
                      </td>
                      <td className="table-cell">
                        <button onClick={() => deleteAttendance(rec)}
                          disabled={deletingAtt === rec.id || savingAtt === rec.id}
                          className="flex items-center gap-1 text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {deletingAtt === rec.id ? '...' : 'ลบ'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
            เวลาที่แสดงและแก้ไขเป็น <strong>เวลาไทย (UTC+7)</strong> ระบบจะแปลงกลับเป็น UTC อัตโนมัติ
          </div>
        </div>
      )}
    </div>
  )
}
