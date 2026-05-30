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

export default function AttendanceScanPage() {
  const [tab, setTab] = useState<'face' | 'qr'>('face')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [selectedSalesPoint, setSelectedSalesPoint] = useState<string>('')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [scanMode, setScanMode] = useState<'checkin' | 'checkout'>('checkin')

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d: any) => setEmployees(d.employees || []))
    fetch('/api/sales-points').then((r) => r.json()).then((d: any) => setSalesPoints(d.salesPoints || []))
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleEmployeeDetected = useCallback(async (employeeId: string, employeeName: string) => {
    if (loading) return
    setLoading(true)
    setScanResult(null)
    try {
      const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, method: 'face', sales_point_id: selectedSalesPoint || undefined }),
      })
      const data = await res.json() as any
      if (res.ok) {
        setScanResult({ success: true, message: data.message, employee_name: data.employee_name, employee_type: data.employee_type, action: scanMode })
      } else {
        setScanResult({ success: false, message: data.error || 'เกิดข้อผิดพลาด', employee_name: employeeName })
      }
    } catch {
      setScanResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setLoading(false)
      setTimeout(() => setScanResult(null), 4000)
    }
  }, [loading, scanMode, selectedSalesPoint])

  const handleQRScan = useCallback(async (code: string) => {
    if (loading) return
    const employee = employees.find((e) => e.qr_code === code)
    if (!employee) {
      setScanResult({ success: false, message: `ไม่พบพนักงานที่มี QR Code: ${code}` })
      setTimeout(() => setScanResult(null), 4000)
      return
    }
    setLoading(true)
    setScanResult(null)
    try {
      const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id, method: 'qr', sales_point_id: selectedSalesPoint || undefined }),
      })
      const data = await res.json() as any
      if (res.ok) {
        setScanResult({ success: true, message: data.message, employee_name: data.employee_name, employee_type: data.employee_type, action: scanMode })
      } else {
        setScanResult({ success: false, message: data.error || 'เกิดข้อผิดพลาด', employee_name: employee.name })
      }
    } catch {
      setScanResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setLoading(false)
      setTimeout(() => setScanResult(null), 4000)
    }
  }, [loading, scanMode, selectedSalesPoint, employees])

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="text-center py-4">
        <h1 className="text-3xl font-bold text-gray-900">สแกนเข้า/ออกงาน</h1>
        <p className="text-5xl font-bold text-blue-800 font-mono mt-3">{currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        <p className="text-gray-500 mt-1">{currentTime.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      <div className="flex rounded-xl overflow-hidden border-2 border-blue-800">
        <button onClick={() => setScanMode('checkin')} className={`flex-1 py-3 font-semibold text-lg transition-colors ${scanMode === 'checkin' ? 'bg-blue-800 text-white' : 'bg-white text-blue-800'}`}>เช็คอิน</button>
        <button onClick={() => setScanMode('checkout')} className={`flex-1 py-3 font-semibold text-lg transition-colors ${scanMode === 'checkout' ? 'bg-blue-800 text-white' : 'bg-white text-blue-800'}`}>เช็คเอาต์</button>
      </div>
      {scanMode === 'checkin' && (
        <div>
          <label className="label">จุดขาย (สำหรับพนักงานขาย)</label>
          <select className="input-field" value={selectedSalesPoint} onChange={(e) => setSelectedSalesPoint(e.target.value)}>
            <option value="">-- ไม่ระบุจุดขาย / ครัวกลาง --</option>
            {salesPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
      )}
      {scanResult && (
        <div className={`p-4 rounded-xl text-center ${scanResult.success ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-400'}`}>
          <p className={`text-xl font-bold ${scanResult.success ? 'text-green-800' : 'text-red-800'}`}>{scanResult.message}</p>
          {scanResult.employee_name && <p className="text-lg mt-1">{scanResult.employee_name}</p>}
        </div>
      )}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-200">
          <button onClick={() => setTab('face')} className={`flex-1 py-3 text-sm font-medium ${tab === 'face' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>สแกนใบหน้า</button>
          <button onClick={() => setTab('qr')} className={`flex-1 py-3 text-sm font-medium ${tab === 'qr' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>QR Code</button>
        </div>
        <div className="p-4">
          {tab === 'face' ? <FaceScanner employees={employees} onMatch={handleEmployeeDetected} isActive={tab === 'face'} /> : <QRScanner onScan={handleQRScan} isActive={tab === 'qr'} />}
        </div>
      </div>
      {loading && <div className="text-center py-2"><div className="inline-flex items-center gap-2 text-blue-600"><div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>กำลังบันทึก...</div></div>}
    </div>
  )
}