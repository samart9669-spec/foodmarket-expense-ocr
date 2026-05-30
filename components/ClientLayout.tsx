'use client'

import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isKiosk = pathname?.startsWith('/kiosk')

  if (isKiosk) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-6 min-h-screen">
        {children}
      </main>
    </div>
  )
}
