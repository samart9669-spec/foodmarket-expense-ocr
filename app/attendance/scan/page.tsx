'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useGeolocation } from '@/lib/useGeolocation'

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
  check_in?: string
  check_out?: string
  action?: 'checkin' | 'checkout'
  total_hours?: number
}

// Stored values are already Bangkok wall-clock — display as-is, no conversion
function thaiDateTime(str: string | null | undefined): { date: string; time: string } | null {
  if (!str) return null
  const [datePart, timePart = ''] = str.replace('T', ' ').split(' ')
  const d = new Date(datePart + 'T00:00:00')
  return {
    date: Number.isNaN(d.getTime()) ? datePart : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: timePart.slice(0, 8) || '-',
  }
}

export default function AttendanceScanPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'face' | 'qr'>('face')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [selectedSalesPoint, setSelectedSalesPoint] = useState<string>('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [scanMode, setScanMode] = useState<'checkin' | 'checkout'>('checkin')
  const { coords, status: gpsStatus } = useGeolocation()

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d: any) => setEmployees(d.employees || [])).catch(() => {})
    fetch('/api/sales-points').then((r) => r.json()).then((d: any) => setSalesPoints(d.salesPoints || [])).catch(() => {})
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleEmployeeDetected = useCallback(
    async (employeeId: string, employeeName: string) => {
      if (loading) return
      setLoading(true)
      setScanResult(null)

      try {
        const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: employeeId,
            method: 'face',
            sales_point_id: selectedSalesPoint || undefined,
            latitude: coords?.lat,
            longitude: coords?.lng,
          }),
        })
        const data = await res.json() as any

        if (res.ok) {
          setScanResult({
            success: true,
            message: scanMode === 'checkin' ? 'บันทึกเช็คอินเรียบร้อย' : 'บันทึกเช็คเอาต์เรียบร้อย',
            employee_name: data.employee_name,
            employee_type: data.employee_type,
            check_in: data.check_in,
            check_out: data.check_out,
            total_hours: data.total_hours,
            action: scanMode,
          })
        } else {
          setScanResult({ success: false, message: data.error || 'เกิดข้อผิดพลาด', employee_name: employeeName })
        }
      } catch {
        setScanResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
      } finally {
        setLoading(false)
      }
    },
    [loading, scanMode, selectedSalesPoint, coords]
  )

  const handleQRScan = useCallback(
    async (code: string) => {
      if (loading) return
      const employee = employees.find((e) => e.qr_code === code)
      if (!employee) {
        setScanResult({ success: false, message: `ไม่พบพนักงานที่มี QR Code: ${code}` })
        return
      }

      setLoading(true)
      setScanResult(null)

      try {
        const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: employee.id, method: 'qr', sales_point_id: selectedSalesPoint || undefined, latitude: coords?.lat, longitude: coords?.lng }),
        })
        const data = await res.json() as any

        if (res.ok) {
          setScanResult({ success: true, message: scanMode === 'checkin' ? 'บันทึกเช็คอินเรียบร้อย' : 'บันทึกเช็คเอาต์เรียบร้อย', employee_name: data.employee_name, employee_type: data.employee_type, check_in: data.check_in, check_out: data.check_out, total_hours: data.total_hours, action: scanMode })
        } else {
          setScanResult({ success: false, message: data.error || 'เกิดข้อผิดพลาด', employee_name: employee.name })
        }
      } catch {
        setScanResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
      } finally {
        setLoading(false)
      }
    },
    [loading, scanMode, selectedSalesPoint, employees, coords]
  )

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold text-gray-900">สแกนเข้า/ออกงาน</h1>
        <p className="text-5xl font-bold text-blue-800 font-mono mt-3">
          {currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
        <p className="text-gray-500 mt-1">
          {currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 text-sm">
          <span className={`w-2 h-2 rounded-full ${
            gpsStatus === 'ok' ? 'bg-green-500' : gpsStatus === 'loading' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
          }`} />
          <span className={gpsStatus === 'ok' ? 'text-green-600' : gpsStatus === 'loading' ? 'text-yellow-600' : 'text-red-600'}>
            {gpsStatus === 'ok' ? 'พบตำแหน่ง GPS' : gpsStatus === 'loading' ? 'กำลังค้นหาตำแหน่ง...' : 'ไม่ได้อนุญาตตำแหน่ง GPS'}
          </span>
        </div>
      </div>

      <div className="flex rounded-xl overflow-hidden border-2 border-blue-800">
        <button
          onClick={() => setScanMode('checkin')}
          className={`flex-1 py-3 font-semibold text-lg transition-colors ${
            scanMode === 'checkin' ? 'bg-blue-800 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'
          }`}
        >
          เช็คอิน
        </button>
        <button
          onClick={() => setScanMode('checkout')}
          className={`flex-1 py-3 font-semibold text-lg transition-colors ${
            scanMode === 'checkout' ? 'bg-blue-800 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'
          }`}
        >
          เช็คเอาต์
        </button>
      </div>

      {scanMode === 'checkin' && (
        <div>
          <label className="label">จุดขาย (สำหรับพนักงานขาย)</label>
          <select
            className="input-field"
            value={selectedSalesPoint}
            onChange={(e) => setSelectedSalesPoint(e.target.value)}
          >
            <option value="">-- ไม่ระบุจุดขาย / ครัวกลาง --</option>
            {salesPoints.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>
      )}

      {scanResult && (
        <div className={`p-4 rounded-xl text-center transition-all ${
          scanResult.success ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-400'
        }`}>
          <div className="flex justify-center mb-2">
            {scanResult.success ? (
              <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>
          {scanResult.employee_name && (
            <p className={`text-xl font-bold mb-0.5 ${scanResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {scanResult.employee_name}
            </p>
          )}
          {scanResult.employee_type && (
            <span className={`inline-block mb-2 px-3 py-1 rounded-full text-sm font-medium ${
              scanResult.employee_type === 'kitchen' ? 'bg-green-200 text-green-800' : 'bg-orange-200 text-orange-800'
            }`}>
              {scanResult.employee_type === 'kitchen' ? 'ครัวกลาง' : 'พนักงานขาย'}
            </span>
          )}
          <p className={`text-base font-semibold ${scanResult.success ? 'text-green-700' : 'text-red-700'}`}>
            {scanResult.message}
          </p>

          {/* Recorded timestamp */}
          {scanResult.success && (() => {
            const utcStr = scanResult.action === 'checkin' ? scanResult.check_in : scanResult.check_out
            const dt = thaiDateTime(utcStr)
            if (!dt) return null
            return (
              <div className="my-3 bg-white border border-green-200 rounded-xl py-3 px-6 inline-block w-full">
                <p className="text-xs text-gray-500 mb-0.5">บันทึกเวลา</p>
                <p className="text-4xl font-mono font-bold text-gray-900 tracking-wide">{dt.time}</p>
                <p className="text-sm text-gray-500 mt-0.5">{dt.date}</p>
                {scanResult.total_hours != null && scanResult.action === 'checkout' && (
                  <p className="text-sm text-green-700 mt-1 font-medium">รวม {scanResult.total_hours.toFixed(1)} ชั่วโมง</p>
                )}
              </div>
            )
          })()}

          {/* Action buttons — stay until user chooses */}
          <div className="flex gap-3 mt-4 justify-center">
            <button
              onClick={() => setScanResult(null)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                scanResult.success
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              สแกนคนต่อไป
            </button>
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              หน้าหลัก
            </button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('face')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              tab === 'face' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            สแกนใบหน้า
          </button>
          <button
            onClick={() => setTab('qr')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              tab === 'qr' ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            QR Code
          </button>
        </div>
        <div className="p-4">
          {tab === 'face' ? (
            <FaceScanner employees={employees} onMatch={handleEmployeeDetected} isActive={tab === 'face' && !scanResult} />
          ) : (
            <QRScanner onScan={handleQRScan} isActive={tab === 'qr' && !scanResult} />
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center py-2">
          <div className="inline-flex items-center gap-2 text-blue-600">
            <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
            กำลังบันทึก...
          </div>
        </div>
      )}
    </div>
  )
}
