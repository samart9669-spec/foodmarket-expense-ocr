'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const FaceScanner = dynamic(() => import('@/components/FaceScanner'), { ssr: false })
const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false })

interface Employee {
  id: string
  name: string
  employee_type: string
  face_descriptor: string | null
  face_photo: string | null
  qr_code: string | null
}

interface SalesPoint {
  id: string
  name: string
}

interface ScanResult {
  success: boolean
  message: string
  employee_name?: string
  employee_type?: string
  action?: 'checkin' | 'checkout'
}

export default function KioskPage() {
  const [tab, setTab] = useState<'face' | 'qr'>('face')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [selectedSalesPoint, setSelectedSalesPoint] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanMode, setScanMode] = useState<'checkin' | 'checkout'>('checkin')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d: any) => setEmployees(d.employees || []))
    fetch('/api/sales-points').then((r) => r.json()).then((d: any) => setSalesPoints(d.salesPoints || []))
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const doCheckInOut = useCallback(async (employeeId: string, employeeName: string, method: 'face' | 'qr') => {
    if (loading) return
    setLoading(true)
    setScanResult(null)
    try {
      const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, method, sales_point_id: selectedSalesPoint || undefined }),
      })
      const data = await res.json() as any
      setScanResult({
        success: res.ok,
        message: res.ok ? data.message : (data.error || 'เกิดข้อผิดพลาด'),
        employee_name: res.ok ? data.employee_name : employeeName,
        employee_type: data.employee_type,
        action: scanMode,
      })
    } catch {
      setScanResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setLoading(false)
      setTimeout(() => setScanResult(null), 5000)
    }
  }, [loading, scanMode, selectedSalesPoint])

  const handleFaceMatch = useCallback((id: string, name: string) => doCheckInOut(id, name, 'face'), [doCheckInOut])

  const handleQRScan = useCallback(async (code: string) => {
    const emp = employees.find((e) => e.qr_code === code)
    if (!emp) {
      setScanResult({ success: false, message: 'ไม่พบพนักงาน QR Code นี้' })
      setTimeout(() => setScanResult(null), 4000)
      return
    }
    await doCheckInOut(emp.id, emp.name, 'qr')
  }, [employees, doCheckInOut])

  const timeStr = currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header — clock + date */}
      <div className="text-center pt-8 pb-4 px-4">
        <p className="text-6xl font-bold font-mono tracking-widest text-white">{timeStr}</p>
        <p className="text-gray-400 mt-2 text-lg">{dateStr}</p>
      </div>

      {/* Check-in / Check-out toggle */}
      <div className="px-4 mx-auto w-full max-w-lg">
        <div className="flex rounded-2xl overflow-hidden border-2 border-gray-700">
          <button
            onClick={() => setScanMode('checkin')}
            className={`flex-1 py-4 font-bold text-xl transition-colors ${
              scanMode === 'checkin' ? 'bg-green-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
            }`}
          >
            เช็คอิน
          </button>
          <button
            onClick={() => setScanMode('checkout')}
            className={`flex-1 py-4 font-bold text-xl transition-colors ${
              scanMode === 'checkout' ? 'bg-orange-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
            }`}
          >
            เช็คเอาต์
          </button>
        </div>
      </div>

      {/* Sales point selector (check-in only) */}
      {scanMode === 'checkin' && salesPoints.length > 0 && (
        <div className="px-4 mx-auto w-full max-w-lg mt-3">
          <select
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:border-blue-500"
            value={selectedSalesPoint}
            onChange={(e) => setSelectedSalesPoint(e.target.value)}
          >
            <option value="">— ครัวกลาง / ไม่ระบุจุดขาย —</option>
            {salesPoints.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Scan result overlay */}
      {scanResult && (
        <div className={`mx-4 mt-4 rounded-2xl p-5 text-center border-2 max-w-lg mx-auto w-full ${
          scanResult.success
            ? 'bg-green-900 border-green-500'
            : 'bg-red-900 border-red-500'
        }`}>
          <div className="flex justify-center mb-3">
            {scanResult.success ? (
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
          {scanResult.employee_name && (
            <p className="text-3xl font-bold mb-1">{scanResult.employee_name}</p>
          )}
          <p className={`text-xl font-semibold ${ scanResult.success ? 'text-green-300' : 'text-red-300'}`}>
            {scanResult.message}
          </p>
          {scanResult.employee_type && scanResult.success && (
            <p className="text-gray-300 mt-1">
              {scanResult.employee_type === 'kitchen' ? '🍳 ครัวกลาง' : '🛒 พนักงานขาย'}
            </p>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center mt-4">
          <div className="inline-flex items-center gap-3 text-blue-400 text-lg">
            <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            กำลังบันทึก...
          </div>
        </div>
      )}

      {/* Scanner */}
      <div className="flex-1 px-4 mt-4 pb-4 mx-auto w-full max-w-lg flex flex-col">
        <div className="flex rounded-xl overflow-hidden border border-gray-700 mb-3">
          <button
            onClick={() => setTab('face')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              tab === 'face' ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            สแกนใบหน้า
          </button>
          <button
            onClick={() => setTab('qr')}
            className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              tab === 'qr' ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            QR Code
          </button>
        </div>

        <div className="flex-1 rounded-2xl overflow-hidden bg-gray-900">
          {tab === 'face' ? (
            <FaceScanner employees={employees} onMatch={handleFaceMatch} isActive={tab === 'face'} />
          ) : (
            <QRScanner onScan={handleQRScan} isActive={tab === 'qr'} />
          )}
        </div>
      </div>

    </div>
  )
}
