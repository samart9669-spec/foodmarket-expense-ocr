'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'

const PAGE_LABELS: Record<string, string> = {
  '/employees': 'พนักงาน',
  '/employees/new': 'เพิ่มพนักงาน',
  '/attendance': 'บันทึกการเข้างาน',
  '/attendance/scan': 'สแกนเข้างาน',
  '/attendance/daily-approval': 'อนุมัติเวลางานรายวัน',
  '/sales': 'ยอดขาย',
  '/payroll': 'เงินเดือน',
  '/shifts': 'ตั้งค่ากะงาน',
  '/payroll-settings': 'ตั้งค่าเงินเดือน',
  '/admin/leave': 'อนุมัติใบลา',
  '/admin/offsite': 'อนุมัติงานนอกสถานที่',
  '/admin/manage': 'จัดการระบบ',
  '/branches': 'จัดการสาขา',
  '/reports/attendance': 'สถิติขาด ลา มาสาย',
  '/reports/attendance/detail': 'รายละเอียดรายบุคคล',
}

function getBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const crumbs: { label: string; href: string }[] = [{ label: 'หน้าหลัก', href: '/' }]
  if (pathname === '/') return crumbs

  const empMatch = pathname.match(/^\/employees\/([^/]+)$/)
  if (empMatch && empMatch[1] !== 'new') {
    crumbs.push({ label: 'พนักงาน', href: '/employees' })
    crumbs.push({ label: 'แก้ไขพนักงาน', href: pathname })
    return crumbs
  }

  const label = PAGE_LABELS[pathname]
  if (label) {
    if (pathname.startsWith('/attendance/')) crumbs.push({ label: 'บันทึกการเข้างาน', href: '/attendance' })
    if (pathname.startsWith('/admin/')) crumbs.push({ label: 'จัดการระบบ', href: '/admin/manage' })
    if (pathname === '/employees/new') crumbs.push({ label: 'พนักงาน', href: '/employees' })
    crumbs.push({ label, href: pathname })
  }

  return crumbs
}

function getParentRoute(pathname: string): string {
  if (/^\/employees\/.+/.test(pathname)) return '/employees'
  if (pathname === '/attendance/daily-approval' || pathname === '/attendance/scan') return '/attendance'
  if (/^\/employee\/.+/.test(pathname)) return '/employee'
  if (pathname !== '/') return '/'
  return '/'
}

interface AuthState { token: string; role: string; username: string; display_name: string }

function getAuth(): AuthState | null {
  try {
    const s = typeof window !== 'undefined' ? sessionStorage.getItem('adminAuth') : null
    return s ? JSON.parse(s) : null
  } catch { return null }
}
function saveAuth(a: AuthState) { sessionStorage.setItem('adminAuth', JSON.stringify(a)) }

function AdminLoginGate({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [checked, setChecked] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const a = getAuth()
    setAuth(a)
    setChecked(true)
  }, [])

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
      const a: AuthState = { token: data.token, role: data.role, username: data.username, display_name: data.display_name }
      saveAuth(a)
      setAuth(a)
    } catch { setError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setLoading(false) }
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!auth) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950 to-gray-950 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="bg-gradient-to-br from-blue-800 to-blue-950 px-8 py-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Powerone Networking</h2>
            <p className="text-blue-200 text-sm mt-1">ระบบจัดการเงินเดือน — เจ้าหน้าที่เท่านั้น</p>
          </div>
          <form onSubmit={submit} className="px-8 py-6 space-y-4">
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
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">รหัสผ่าน</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                <input
                  type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่าน" autoComplete="current-password"
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full py-3 rounded-xl font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังตรวจสอบ...
                  </span>
                : 'เข้าสู่ระบบ'
              }
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isNoSidebar = pathname?.startsWith('/kiosk') || pathname === '/employee' || pathname?.startsWith('/employee/')

  useEffect(() => {
    history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      history.pushState(null, '', window.location.href)
      const current = window.location.pathname
      const parent = getParentRoute(current)
      if (parent !== current) router.push(parent)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isNoSidebar) {
    return <>{children}</>
  }

  const crumbs = getBreadcrumbs(pathname ?? '/')
  const isHome = pathname === '/'

  return (
    <AdminLoginGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-64 flex flex-col min-h-screen">
          <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-2.5 flex items-center justify-between gap-4">
            <nav className="flex items-center gap-1.5 text-sm min-w-0 overflow-hidden">
              {crumbs.map((crumb, i) => (
                <span key={crumb.href} className="flex items-center gap-1.5 min-w-0">
                  {i > 0 && (
                    <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {i < crumbs.length - 1 ? (
                    <Link href={crumb.href} className="text-blue-600 hover:text-blue-800 font-medium truncate flex items-center gap-1">
                      {i === 0 && (
                        <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      )}
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-500 truncate flex items-center gap-1">
                      {i === 0 && (
                        <svg className="w-4 h-4 inline-block text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      )}
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
            {!isHome && (
              <Link
                href="/"
                className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                หน้าหลัก
              </Link>
            )}
          </div>
          <main className="flex-1 p-6 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </AdminLoginGate>
  )
}
