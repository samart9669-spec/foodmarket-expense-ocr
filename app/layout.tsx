import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'ระบบจัดการเงินเดือน - ตลาดอาหาร',
  description: 'ระบบจัดการเงินเดือนรายวันสำหรับธุรกิจตลาดอาหาร',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-thai bg-gray-50 min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64 p-6 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
