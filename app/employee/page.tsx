'use client'

export const runtime = 'edge'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { APP_VERSION, formatBuildTime } from '@/lib/version'

export default function EmployeeLandingPage() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const timeStr = time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = time.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="text-center pt-12 pb-6 px-6">
        <div className="w-16 h-16 bg-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-blue-200">Powerone Networking</h1>
        <p className="text-5xl font-bold font-mono tracking-widest mt-3">{timeStr}</p>
        <p className="text-gray-400 mt-2">{dateStr}</p>
      </div>

      {/* Main actions */}
      <div className="flex-1 px-5 pb-10 space-y-4 max-w-md mx-auto w-full">
        <Link href="/employee/checkin" className="block">
          <div className="bg-green-700 hover:bg-green-600 active:bg-green-800 rounded-2xl p-6 flex items-center gap-5 transition-colors shadow-lg">
            <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold">ลงเวลาเข้า/ออกงาน</p>
              <p className="text-green-200 text-sm mt-0.5">เช็คอิน · เช็คเอาต์ · ตรวจสอบ GPS</p>
            </div>
            <svg className="w-6 h-6 text-green-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link href="/employee/leave" className="block">
          <div className="bg-orange-700 hover:bg-orange-600 active:bg-orange-800 rounded-2xl p-6 flex items-center gap-5 transition-colors shadow-lg">
            <div className="w-14 h-14 bg-orange-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold">ขอลางาน</p>
              <p className="text-orange-200 text-sm mt-0.5">ลาป่วย · ลาพักร้อน · ลากิจ · ฉุกเฉิน</p>
            </div>
            <svg className="w-6 h-6 text-orange-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link href="/employee/offsite" className="block">
          <div className="bg-purple-700 hover:bg-purple-600 active:bg-purple-800 rounded-2xl p-6 flex items-center gap-5 transition-colors shadow-lg">
            <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold">ขอปฏิบัติงานนอกสถานที่</p>
              <p className="text-purple-200 text-sm mt-0.5">แนบพิกัดสถานที่ · รออนุมัติ · เช็คอินนอกสถานที่</p>
            </div>
            <svg className="w-6 h-6 text-purple-300 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link href="/employee/history" className="block">
          <div className="bg-gray-800 hover:bg-gray-700 active:bg-gray-900 rounded-2xl p-6 flex items-center gap-5 transition-colors shadow-lg">
            <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold">ประวัติการทำงาน</p>
              <p className="text-gray-400 text-sm mt-0.5">ตรวจสอบเวลา · ใบลา · รายได้</p>
            </div>
            <svg className="w-6 h-6 text-gray-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <p className="text-center text-gray-600 text-xs pt-4">
          ระบบพนักงาน · Powerone Networking
        </p>
        <p className="text-center text-gray-700 text-[11px] font-mono">
          v{APP_VERSION} · อัปเดต {formatBuildTime()}
        </p>
      </div>
    </div>
  )
}
