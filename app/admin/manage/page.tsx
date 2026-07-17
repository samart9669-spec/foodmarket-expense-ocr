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
interface AdminUser {
  id: string
  username: string
  display_name: string
  role: string
  is_active: number
}

// ── Auth helpers (client-side sessionStorage) ─────────────────────
interface AuthState { token: string; role: string; username: string; display_name: string }
function getAuth(): AuthState | null {
  try {
    const s = typeof window !== 'undefined' ? sessionStorage.getItem('adminAuth') : null
    return s ? JSON.parse(s) : null
  } catch { return null }
}
function saveAuth(a: AuthState) { sessionStorage.setItem('adminAuth', JSON.stringify(a)) }
function clearAuth() { sessionStorage.removeItem('adminAuth') }
function authHeaders(token: string) { return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }

// ── Time conversion helpers ───────────────────────────────────────
function utcToThaiHHMM(utcStr: string | null): string {
  if (!utcStr) return ''
  const iso = utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z'
  const d = new Date(iso)
  const hNum = d.getUTCHours() + 7
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${String(hNum % 24).padStart(2, '0')}:${m}`
}

function thaiHHMMToUtc(date: string, hhMM: string): string {
  const [hh, mm] = hhMM.split(':').map(Number)
  const utcHour = hh - 7
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCHours(utcHour, mm, 0, 0)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

// ── Role labels & colors ──────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  superadmin: 'เจ้าของระบบ',
  admin: 'ผู้จัดการ',
  manager: 'หัวหน้างาน',
  viewer: 'ผู้ดูแล (อ่านอย่างเดียว)',
}
const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-800 border-purple-300',
  admin: 'bg-red-100 text-red-800 border-red-300',
  manager: 'bg-blue-100 text-blue-800 border-blue-300',
  viewer: 'bg-gray-100 text-gray-700 border-gray-300',
}

// ── Users Tab ─────────────────────────────────────────────────────
function UsersTab({ token, currentUsername }: { token: string; currentUsername: string }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // Add form state
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole, setNewRole] = useState<string>('viewer')
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders(token) })
      const data = await res.json() as any
      setUsers(data.users || [])
    } catch {} finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    if (!newUsername.trim() || !newPassword || !newDisplayName.trim()) {
      setAddError('กรุณากรอกข้อมูลให้ครบ')
      return
    }
    if (newPassword.length < 6) {
      setAddError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          display_name: newDisplayName.trim(),
          role: newRole,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { setAddError(data.error || 'เกิดข้อผิดพลาด'); return }
      setUsers(prev => [...prev, { ...data, is_active: 1 }])
      setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewRole('viewer')
      setShowAddForm(false)
    } catch { setAddError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setAdding(false) }
  }

  const startEdit = (u: AdminUser) => {
    setEditingId(u.id)
    setEditDisplayName(u.display_name)
    setEditRole(u.role)
  }

  const saveEdit = async (u: AdminUser) => {
    setActing(u.id)
    try {
      const body: any = { display_name: editDisplayName }
      if (u.username !== currentUsername) body.role = editRole
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      const data = await res.json() as any
      if (!res.ok) { alert(data.error || 'เกิดข้อผิดพลาด'); return }
      setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, ...data.user } : usr))
      setEditingId(null)
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setActing(null) }
  }

  const resetPassword = async (u: AdminUser) => {
    const pw = prompt(`รีเซ็ตรหัสผ่านของ "${u.display_name}"\nกรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร):`)
    if (!pw) return
    if (pw.length < 6) { alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    setActing(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json() as any
      if (!res.ok) { alert(data.error || 'เกิดข้อผิดพลาด'); return }
      alert('รีเซ็ตรหัสผ่านสำเร็จ')
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setActing(null) }
  }

  const toggleActive = async (u: AdminUser) => {
    const newActive = u.is_active === 1 ? 0 : 1
    const confirmMsg = newActive === 0
      ? `ปิดใช้งานบัญชี "${u.display_name}"?`
      : `เปิดใช้งานบัญชี "${u.display_name}"?`
    if (!confirm(confirmMsg)) return
    setActing(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ is_active: newActive }),
      })
      const data = await res.json() as any
      if (!res.ok) { alert(data.error || 'เกิดข้อผิดพลาด'); return }
      setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, is_active: newActive } : usr))
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setActing(null) }
  }

  const deleteUser = async (u: AdminUser) => {
    if (u.username === currentUsername) { alert('ไม่สามารถลบบัญชีตัวเองได้'); return }
    if (!confirm(`ลบบัญชี "${u.display_name}" (${u.username}) ถาวร?\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return
    setActing(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      const data = await res.json() as any
      if (!res.ok) { alert(data.error || 'เกิดข้อผิดพลาด'); return }
      setUsers(prev => prev.filter(usr => usr.id !== u.id))
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setActing(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">ผู้ใช้ระบบทั้งหมด ({users.length} คน)</h2>
        <button
          onClick={() => { setShowAddForm(v => !v); setAddError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          เพิ่มผู้ใช้
        </button>
      </div>

      {/* Add user form */}
      {showAddForm && (
        <div className="card border border-purple-200 bg-purple-50">
          <h3 className="font-semibold text-purple-900 mb-4">เพิ่มผู้ใช้ใหม่</h3>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ชื่อผู้ใช้ (username)</label>
              <input
                type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
                placeholder="ตัวเล็กพิมพ์เล็ก ไม่มีช่องว่าง"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ชื่อที่แสดง</label>
              <input
                type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)}
                placeholder="ชื่อ-นามสกุล หรือชื่อเล่น"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
              <input
                type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="รหัสผ่าน"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">บทบาท</label>
              <select
                value={newRole} onChange={e => setNewRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {addError && (
              <div className="sm:col-span-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {addError}
              </div>
            )}
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit" disabled={adding}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {adding ? 'กำลังเพิ่ม...' : 'เพิ่มผู้ใช้'}
              </button>
              <button
                type="button" onClick={() => { setShowAddForm(false); setAddError('') }}
                className="px-5 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center py-12 text-gray-400">ยังไม่มีผู้ใช้ในระบบ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-purple-50 border-b border-purple-100">
                <tr>
                  <th className="table-header">ชื่อที่แสดง</th>
                  <th className="table-header">username</th>
                  <th className="table-header">บทบาท</th>
                  <th className="table-header">สถานะ</th>
                  <th className="table-header">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 ${u.is_active === 0 ? 'opacity-50' : ''}`}>
                    <td className="table-cell">
                      {editingId === u.id ? (
                        <input
                          type="text" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-full max-w-[180px] focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                      ) : (
                        <span className="font-medium text-gray-900">
                          {u.display_name}
                          {u.username === currentUsername && (
                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">คุณ</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs text-gray-500">{u.username}</td>
                    <td className="table-cell">
                      {editingId === u.id && u.username !== currentUsername ? (
                        <select
                          value={editRole} onChange={e => setEditRole(e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'ใช้งาน' : 'ปิดแล้ว'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2 flex-wrap">
                        {editingId === u.id ? (
                          <>
                            <button
                              onClick={() => saveEdit(u)} disabled={acting === u.id}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                            >
                              {acting === u.id ? 'บันทึก...' : 'บันทึก'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs font-medium rounded-lg"
                            >
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(u)} disabled={!!acting}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => resetPassword(u)} disabled={acting === u.id}
                              className="px-2.5 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                            >
                              รีเซ็ตรหัส
                            </button>
                            {u.username !== currentUsername && (
                              <>
                                <button
                                  onClick={() => toggleActive(u)} disabled={acting === u.id}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors ${
                                    u.is_active
                                      ? 'bg-orange-100 hover:bg-orange-200 text-orange-800'
                                      : 'bg-green-100 hover:bg-green-200 text-green-800'
                                  }`}
                                >
                                  {u.is_active ? 'ปิดใช้' : 'เปิดใช้'}
                                </button>
                                <button
                                  onClick={() => deleteUser(u)} disabled={acting === u.id}
                                  className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg disabled:opacity-40 transition-colors"
                                >
                                  ลบ
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700">
        <strong>หมายเหตุ:</strong> ผู้ใช้ที่ถูกปิดใช้งานหรือรีเซ็ตรหัสผ่านจะถูกบังคับออกจากระบบทันที
      </div>
    </div>
  )
}

// ── Login Modal ───────────────────────────────────────────────────
function LoginModal({ onAuth }: { onAuth: (auth: AuthState) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); return }
      const authObj: AuthState = {
        token: data.token,
        role: data.role,
        username: data.username,
        display_name: data.display_name,
      }
      saveAuth(authObj)
      onAuth(authObj)
    } catch { setError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-red-700 to-red-900 px-8 py-7 flex flex-col items-center">
          <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mb-3">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">เข้าสู่ระบบผู้ดูแล</h2>
          <p className="text-red-200 text-sm mt-1">Powerone Networking · Admin</p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-8 py-6 space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">ชื่อผู้ใช้</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้" autoFocus autoComplete="username"
                className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">รหัสผ่าน</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </span>
              <input
                type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน" autoComplete="current-password"
                className="w-full border border-gray-300 rounded-xl pl-9 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw
                  ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !username.trim() || !password}
            className="w-full py-3 rounded-xl font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading
              ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังตรวจสอบ...</span>
              : 'เข้าสู่ระบบ'
            }
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function AdminManagePage() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [tab, setTab] = useState<'employees' | 'attendance' | 'users'>('employees')

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
    const a = getAuth()
    if (a) setAuth(a)
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
    if (!auth) return
    if (tab === 'employees') loadEmployees(auth.token)
    else if (tab === 'attendance') loadAttendance(auth.token)
  }, [auth, tab, showInactive, date, loadEmployees, loadAttendance])

  // ── Hard delete employee ────────────────────────────────────────
  const hardDelete = async (emp: Employee, token: string) => {
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
    if (!auth) return
    const edit = editing[record.id]
    if (!edit) return
    setSavingAtt(record.id)
    try {
      const body: any = {}
      if (edit.check_in) body.check_in = thaiHHMMToUtc(record.date, edit.check_in)
      if (edit.check_out) body.check_out = thaiHHMMToUtc(record.date, edit.check_out)

      const res = await fetch(`/api/admin/attendance/${record.id}`, {
        method: 'PATCH',
        headers: authHeaders(auth.token),
        body: JSON.stringify(body),
      })
      if (!res.ok) { alert('บันทึกไม่สำเร็จ'); return }
      const { record: updated } = await res.json() as any
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, ...updated } : r))
      alert('บันทึกเวลาสำเร็จ')
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setSavingAtt(null) }
  }

  // ── Delete attendance record ────────────────────────────────────
  const deleteAttendance = async (record: AttendanceRecord) => {
    if (!auth) return
    if (!confirm(`ลบบันทึกเข้างานของ "${record.employee_name}" วันที่ ${record.date} ?\nการกระทำนี้ไม่สามารถกู้คืนได้`)) return
    setDeletingAtt(record.id)
    try {
      const res = await fetch(`/api/admin/attendance/${record.id}`, {
        method: 'DELETE',
        headers: authHeaders(auth.token),
      })
      if (!res.ok) { alert('ลบไม่สำเร็จ'); return }
      setRecords(prev => prev.filter(r => r.id !== record.id))
    } catch { alert('เกิดข้อผิดพลาด') }
    finally { setDeletingAtt(null) }
  }

  const handleAuth = (a: AuthState) => setAuth(a)
  const handleLogout = async () => {
    if (auth) {
      await fetch('/api/admin/auth', { method: 'DELETE', headers: authHeaders(auth.token) }).catch(() => {})
    }
    clearAuth()
    setAuth(null)
  }

  return (
    <div className="space-y-6">
      {!auth && <LoginModal onAuth={handleAuth} />}

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
        {auth && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>
              ● {auth.display_name}
            </span>
            <button onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ออกจากระบบ
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {(['employees', 'attendance'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'employees' ? '👤 จัดการพนักงาน' : '🕐 แก้ไขเวลาเข้างาน'}
          </button>
        ))}
        {auth?.role === 'superadmin' && (
          <button onClick={() => setTab('users')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            👤 จัดการผู้ใช้ระบบ
          </button>
        )}
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
                        {(auth?.role === 'superadmin' || auth?.role === 'admin') && (
                          <button onClick={() => hardDelete(emp, auth!.token)} disabled={actingEmp === emp.id}
                            className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-40">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {actingEmp === emp.id ? 'กำลังลบ...' : 'ลบถาวร'}
                          </button>
                        )}
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

      {/* ── Users management ── */}
      {tab === 'users' && auth?.role === 'superadmin' && (
        <UsersTab token={auth.token} currentUsername={auth.username} />
      )}
    </div>
  )
}
