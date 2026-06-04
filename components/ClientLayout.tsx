'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'

const TOP_TABS = [
  { href: '/', label: 'แดชบอร์ด', exact: true },
  { href: '/attendance/daily-approval', label: 'อนุมัติเวลาประจำวัน' },
  { href: '/payroll', label: 'สรุปยอดเงินเดือน' },
  { href: '/payroll-settings', label: 'ตั้งค่าระบบ' },
]

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
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!auth) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-950 to-gray-900 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gray-900 px-8 py-8 flex flex-col items-center">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <rect x="2" y="2" width="7" height="7" rx="1" />
                  <rect x="11" y="2" width="7" height="7" rx="1" />
                  <rect x="2" y="11" width="7" height="7" rx="1" />
                  <rect x="11" y="11" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-xl tracking-widest">ROSSO</p>
                <p className="text-[10px] text-gray-400 tracking-widest">PAYROLL SYSTEM</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm mt-2">เจ้าหน้าที่เท่านั้น</p>
          </div>

          {/* Form */}
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
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
                  className="w-full border border-gray-300 rounded-xl pl-9 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
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
              className="w-full py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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

function TopBar() {
  const pathname = usePathname()
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    setAuth(getAuth())
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((d: any) => setPendingCount(d.pending_payroll ?? 0))
      .catch(() => {})
  }, [])

  const initials = auth?.display_name
    ? auth.display_name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()
    : 'AD'

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 h-14 flex items-center gap-0">
      {/* Page icon + label */}
      <div className="flex items-center gap-2 pr-6 border-r border-gray-200 h-full">
        <div className="w-7 h-7 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
            <rect x="2" y="2" width="7" height="7" rx="1" />
            <rect x="11" y="2" width="7" height="7" rx="1" />
            <rect x="2" y="11" width="7" height="7" rx="1" />
            <rect x="11" y="11" width="7" height="7" rx="1" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-700">แดชบอร์ด</span>
      </div>

      {/* Tabs */}
      <nav className="flex-1 flex items-center h-full px-6 gap-6">
        {TOP_TABS.map((tab) => {
          const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`text-sm font-medium h-full flex items-center border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* Right: bell + user */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <button className="relative p-1.5 text-gray-500 hover:text-gray-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-tight">{auth?.display_name ?? 'Administrator'}</p>
            <p className="text-xs text-gray-500 leading-tight capitalize">{auth?.role ?? 'Administrator'}</p>
          </div>
        </div>
      </div>
    </div>
  )
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

  return (
    <AdminLoginGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-56 flex flex-col min-h-screen">
          <TopBar />
          <main className="flex-1 p-6 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </AdminLoginGate>
  )
}
