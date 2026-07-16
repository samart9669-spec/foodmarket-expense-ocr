'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const FaceScanner = dynamic(() => import('@/components/FaceScanner'), { ssr: false })
const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false })

interface Employee { id: string; name: string; employee_type: string; face_descriptor: string | null; face_photo: string | null; qr_code: string | null }
interface SalesPoint { id: string; name: string; location: string; latitude: number | null; longitude: number | null; radius_meters: number | null }
interface Shift { id: string; name: string; start_time: string; end_time: string }
interface OffsiteApproval { id: string; employee_id: string; employee_name: string; location_name: string }

type GpsState = 'idle' | 'getting' | 'ok' | 'far' | 'no-gps' | 'denied'
type ScanMode = 'checkin' | 'checkout'

function thaiDateTime(utcStr: string | null | undefined): { date: string; time: string } | null {
  if (!utcStr) return null
  const d = new Date(utcStr.includes('T') ? utcStr : utcStr.replace(' ', 'T') + 'Z')
  return {
    date: d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function EmployeeCheckinPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [offsiteToday, setOffsiteToday] = useState<OffsiteApproval[]>([])
  const [tab, setTab] = useState<'face' | 'qr'>('face')
  const [scanMode, setScanMode] = useState<ScanMode>('checkin')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedShift, setSelectedShift] = useState('')
  const [gpsState, setGpsState] = useState<GpsState>('idle')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsDistance, setGpsDistance] = useState<number | null>(null)
  const [result, setResult] = useState<{ success: boolean; message: string; name?: string; recorded?: { date: string; time: string }; hours?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const posRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    Promise.all([
      fetch('/api/employees').then(r => r.json()).catch(() => ({ employees: [] })),
      fetch('/api/sales-points').then(r => r.json()).catch(() => ({ salesPoints: [] })),
      fetch('/api/shifts').then(r => r.json()).catch(() => ({ shifts: [] })),
      fetch(`/api/offsite-requests?status=approved&date=${todayStr}`).then(r => r.json()).catch(() => ({ offsiteRequests: [] })),
    ]).then(([e, sp, sh, off]: any) => {
      setEmployees(e.employees || [])
      setSalesPoints(sp.salesPoints || [])
      setShifts(sh.shifts || [])
      setOffsiteToday(off.offsiteRequests || [])
    })
  }, [])

  const getGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsState('no-gps'); return }
    setGpsState('getting')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGpsCoords(coords)
        posRef.current = coords

        if (selectedBranch && selectedBranch !== 'offsite') {
          const branch = salesPoints.find(s => s.id === selectedBranch)
          if (branch?.latitude && branch?.longitude) {
            const dist = distanceMeters(coords.lat, coords.lng, branch.latitude, branch.longitude)
            setGpsDistance(Math.round(dist))
            setGpsState(dist <= (branch.radius_meters ?? 200) ? 'ok' : 'far')
            return
          }
        }
        setGpsDistance(null)
        setGpsState('ok')
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }, [selectedBranch, salesPoints])

  // Fetch GPS immediately on load — coordinates are needed even when no branch
  // is selected (e.g. approved offsite work or head office staff)
  useEffect(() => {
    getGPS()
  }, [getGPS])

  const doAction = useCallback(async (employeeId: string, employeeName: string, method: 'face' | 'qr') => {
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const coords = posRef.current
      const endpoint = scanMode === 'checkin' ? '/api/attendance/checkin' : '/api/attendance/checkout'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId, method,
          sales_point_id: selectedBranch && selectedBranch !== 'offsite' ? selectedBranch : undefined,
          shift_id: selectedShift || undefined,
          latitude: coords?.lat, longitude: coords?.lng,
        }),
      })
      const data = await res.json() as any
      const utcTime = scanMode === 'checkin' ? data.check_in : data.check_out
      setResult({
        success: res.ok,
        message: res.ok ? (scanMode === 'checkin' ? 'บันทึกเช็คอินเรียบร้อย' : 'บันทึกเช็คเอาต์เรียบร้อย') : data.error,
        name: data.employee_name || employeeName,
        recorded: res.ok ? thaiDateTime(utcTime) ?? undefined : undefined,
        hours: res.ok && scanMode === 'checkout' ? data.total_hours : undefined,
      })
    } catch {
      setResult({ success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' })
    } finally {
      setLoading(false)
    }
  }, [loading, scanMode, selectedBranch, selectedShift])

  const handleFace = useCallback((id: string, name: string) => doAction(id, name, 'face'), [doAction])
  const handleQR = useCallback(async (code: string) => {
    const emp = employees.find(e => e.qr_code === code)
    if (!emp) { setResult({ success: false, message: 'ไม่พบพนักงาน QR Code นี้' }); return }
    await doAction(emp.id, emp.name, 'qr')
  }, [employees, doAction])

  const branch = salesPoints.find(s => s.id === selectedBranch)
  const gpsHasCoords = branch?.latitude && branch?.longitude

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4">
        <Link href="/employee" className="p-2 bg-gray-800 rounded-xl">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold flex-1">ลงเวลาเข้า/ออกงาน</h1>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-4 max-w-lg mx-auto w-full">
        {/* Check-in / Check-out toggle */}
        <div className="flex rounded-2xl overflow-hidden border-2 border-gray-700">
          <button onClick={() => setScanMode('checkin')}
            className={`flex-1 py-3.5 font-bold text-lg ${scanMode === 'checkin' ? 'bg-green-600' : 'bg-gray-900 text-gray-400'}`}>
            เช็คอิน
          </button>
          <button onClick={() => setScanMode('checkout')}
            className={`flex-1 py-3.5 font-bold text-lg ${scanMode === 'checkout' ? 'bg-orange-600' : 'bg-gray-900 text-gray-400'}`}>
            เช็คเอาต์
          </button>
        </div>

        {/* Branch + Shift selectors */}
        <div className="space-y-2">
          <select className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3"
            value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
            <option value="">— เลือกสาขา / จุดขาย —</option>
            {salesPoints.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            {offsiteToday.length > 0 && (
              <option value="offsite">📍 ปฏิบัติงานนอกสถานที่ (อนุมัติแล้ววันนี้)</option>
            )}
          </select>
          <select className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3"
            value={selectedShift} onChange={e => setSelectedShift(e.target.value)}>
            <option value="">— เลือกกะงาน (ไม่บังคับ) —</option>
            {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
          </select>
        </div>

        {/* Offsite approvals today */}
        {(selectedBranch === 'offsite' || (!selectedBranch && offsiteToday.length > 0)) && (
          <div className="rounded-xl px-4 py-3 bg-purple-900/50 border border-purple-600 text-sm space-y-1">
            <p className="font-semibold text-purple-200 flex items-center gap-1.5">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ได้รับอนุมัติปฏิบัติงานนอกสถานที่วันนี้
            </p>
            {offsiteToday.map(o => (
              <p key={o.id} className="text-purple-300 text-xs">• {o.employee_name} — {o.location_name}</p>
            ))}
            <p className="text-purple-400 text-xs pt-0.5">สแกนได้เลย ระบบจะตรวจตำแหน่งกับจุดที่ได้รับอนุมัติโดยอัตโนมัติ</p>
          </div>
        )}

        {/* GPS status — always visible so coordinates are ready before scanning */}
        {(!selectedBranch || selectedBranch === 'offsite' || !gpsHasCoords) && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm ${
            gpsState === 'ok' ? 'bg-green-900 border border-green-600' :
            gpsState === 'getting' ? 'bg-blue-900 border border-blue-600' :
            gpsState === 'denied' ? 'bg-yellow-900 border border-yellow-600' :
            'bg-gray-800 border border-gray-700'
          }`}>
            {gpsState === 'getting' && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
            {gpsState === 'ok' && <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            {(gpsState === 'denied' || gpsState === 'no-gps') && <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
            <div className="flex-1">
              {gpsState === 'idle' && <button onClick={getGPS} className="text-blue-400 underline">ตรวจสอบตำแหน่ง GPS</button>}
              {gpsState === 'getting' && <span className="text-blue-300">กำลังหาตำแหน่ง...</span>}
              {gpsState === 'ok' && <span className="text-green-300">พบตำแหน่ง GPS ✓ พร้อมสแกน</span>}
              {gpsState === 'far' && <span className="text-green-300">พบตำแหน่ง GPS ✓ พร้อมสแกน</span>}
              {gpsState === 'denied' && <span className="text-yellow-300">ไม่ได้รับสิทธิ์ GPS — กรุณาอนุญาตใน Settings แล้วกดรีเฟรช</span>}
              {gpsState === 'no-gps' && <span className="text-gray-400">อุปกรณ์นี้ไม่รองรับ GPS</span>}
            </div>
            {gpsState !== 'getting' && gpsState !== 'idle' && (
              <button onClick={getGPS} className="text-xs text-gray-400 underline ml-2">รีเฟรช</button>
            )}
          </div>
        )}

        {/* Branch GPS distance */}
        {selectedBranch && selectedBranch !== 'offsite' && gpsHasCoords && (
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 text-sm ${
            gpsState === 'ok' ? 'bg-green-900 border border-green-600' :
            gpsState === 'far' ? 'bg-red-900 border border-red-600' :
            gpsState === 'getting' ? 'bg-blue-900 border border-blue-600' :
            gpsState === 'denied' ? 'bg-yellow-900 border border-yellow-600' :
            'bg-gray-800 border border-gray-700'
          }`}>
            {gpsState === 'getting' && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
            {gpsState === 'ok' && <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            {gpsState === 'far' && <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
            {gpsState === 'denied' && <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>}
            <div className="flex-1">
              {gpsState === 'idle' && <button onClick={getGPS} className="text-blue-400 underline">ตรวจสอบตำแหน่ง GPS</button>}
              {gpsState === 'getting' && <span className="text-blue-300">กำลังหาตำแหน่ง...</span>}
              {gpsState === 'ok' && <span className="text-green-300">อยู่ในพื้นที่สาขา{gpsDistance != null ? ` (${gpsDistance} ม.)` : ''} ✓</span>}
              {gpsState === 'far' && <span className="text-red-300">อยู่ห่างจากสาขา {gpsDistance} เมตร — ต้องอยู่ใกล้กว่านี้</span>}
              {gpsState === 'denied' && <span className="text-yellow-300">ไม่ได้รับสิทธิ์ GPS — กรุณาอนุญาตใน Settings</span>}
              {gpsState === 'no-gps' && <span className="text-gray-400">อุปกรณ์นี้ไม่รองรับ GPS</span>}
            </div>
            {(gpsState === 'ok' || gpsState === 'far') && (
              <button onClick={getGPS} className="text-xs text-gray-400 underline ml-2">รีเฟรช</button>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`rounded-2xl p-5 text-center border-2 ${result.success ? 'bg-green-900 border-green-500' : 'bg-red-900 border-red-500'}`}>
            <div className="flex justify-center mb-2">
              {result.success
                ? <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center"><svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>
                : <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center"><svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></div>
              }
            </div>
            {result.name && <p className="text-2xl font-bold mb-1">{result.name}</p>}
            <p className={`text-base font-semibold ${result.success ? 'text-green-300' : 'text-red-300'}`}>{result.message}</p>
            {result.recorded && (
              <div className="my-3 bg-black bg-opacity-25 rounded-xl py-3 px-4">
                <p className="text-xs text-gray-400 mb-0.5">บันทึกเวลา</p>
                <p className="text-4xl font-mono font-bold tracking-wide">{result.recorded.time}</p>
                <p className="text-sm text-gray-300 mt-0.5">{result.recorded.date}</p>
                {result.hours != null && (
                  <p className="text-sm text-green-300 mt-1">รวม {result.hours.toFixed(1)} ชั่วโมง</p>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setResult(null)}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-white"
              >
                สแกนคนต่อไป
              </button>
              <Link href="/employee"
                className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 font-semibold text-white text-center"
              >
                หน้าหลัก
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center"><div className="inline-flex items-center gap-2 text-blue-400"><div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />กำลังบันทึก...</div></div>
        )}

        {/* Scanner */}
        <div className="rounded-2xl overflow-hidden border border-gray-700">
          <div className="flex border-b border-gray-700">
            <button onClick={() => setTab('face')} className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${tab === 'face' ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              สแกนใบหน้า
            </button>
            <button onClick={() => setTab('qr')} className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${tab === 'qr' ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              QR Code
            </button>
          </div>
          <div className="bg-gray-900">
            {tab === 'face'
              ? <FaceScanner employees={employees} onMatch={handleFace} isActive={tab === 'face' && !result} />
              : <QRScanner onScan={handleQR} isActive={tab === 'qr'} />
            }
          </div>
        </div>
      </div>
    </div>
  )
}
