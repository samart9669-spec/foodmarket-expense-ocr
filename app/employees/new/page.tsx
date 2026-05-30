'use client'

export const runtime = 'edge'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const FACEAPI_MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights'

interface SalesPoint {
  id: string
  name: string
}

export default function NewEmployeePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [form, setForm] = useState({
    name: '',
    employee_type: 'kitchen',
    sales_point_id: '',
    daily_rate: 350,
    ot_rate: 50,
    commission_rate: 0,
    phone: '',
  })
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [cameraOn, setCameraOn] = useState(false)
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
  const [faceCaptured, setFaceCaptured] = useState(false)
  const [faceapiLoaded, setFaceapiLoaded] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [captureLoading, setCaptureLoading] = useState(false)

  const [qrCode, setQrCode] = useState('')

  useEffect(() => {
    fetch('/api/sales-points')
      .then((r) => r.json())
      .then((d: any) => setSalesPoints(d.salesPoints || []))

    if (window.faceapi) {
      setFaceapiLoaded(true)
    } else {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
      script.async = true
      script.onload = () => setFaceapiLoaded(true)
      document.head.appendChild(script)
    }
  }, [])

  useEffect(() => {
    if (!faceapiLoaded) return
    const load = async () => {
      try {
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL_URL),
          window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACEAPI_MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODEL_URL),
        ])
        setModelsLoaded(true)
      } catch {
        // Models failed to load from CDN
      }
    }
    load()
  }, [faceapiLoaded])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch {
      setError('ไม่สามารถเปิดกล้องได้')
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOn(false)
  }

  const captureFace = async () => {
    if (!videoRef.current || !modelsLoaded) return
    setCaptureLoading(true)
    try {
      const detection = await window.faceapi
        .detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        alert('ไม่พบใบหน้าในกล้อง กรุณาจัดตำแหน่งใบหน้าให้ชัดเจน')
        return
      }

      setFaceDescriptor(Array.from(detection.descriptor))
      setFaceCaptured(true)
      stopCamera()
    } catch {
      alert('เกิดข้อผิดพลาดในการจับภาพใบหน้า')
    } finally {
      setCaptureLoading(false)
    }
  }

  const generateQR = () => {
    const code = `EMP-${Date.now().toString(36).toUpperCase()}`
    setQrCode(code)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('กรุณากรอกชื่อพนักงาน')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        ...form,
        face_descriptor: faceDescriptor ? JSON.stringify(faceDescriptor) : undefined,
        qr_code: qrCode || undefined,
        sales_point_id: form.employee_type === 'sales' ? form.sales_point_id : undefined,
      }

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json() as any
      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด')
        return
      }

      router.push('/employees')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มพนักงานใหม่</h1>
        <p className="text-gray-500 text-sm mt-1">กรอกข้อมูลพนักงานให้ครบถ้วน</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ข้อมูลพื้นฐาน</h2>

          <div>
            <label className="label">ชื่อ-นามสกุล *</label>
            <input
              type="text"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น สมชาย ใจดี"
              required
            />
          </div>

          <div>
            <label className="label">ประเภทพนักงาน *</label>
            <select
              className="input-field"
              value={form.employee_type}
              onChange={(e) => setForm({ ...form, employee_type: e.target.value })}
            >
              <option value="kitchen">ครัวกลาง</option>
              <option value="sales">พนักงานขายหน้าร้าน</option>
            </select>
          </div>

          {form.employee_type === 'sales' && (
            <div>
              <label className="label">จุดขายประจำ</label>
              <select
                className="input-field"
                value={form.sales_point_id}
                onChange={(e) => setForm({ ...form, sales_point_id: e.target.value })}
              >
                <option value="">-- เลือกจุดขาย --</option>
                {salesPoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input
              type="tel"
              className="input-field"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0812345678"
            />
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">โครงสร้างรายได้</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">ค่าแรงรายวัน (฿)</label>
              <input
                type="number"
                className="input-field"
                value={form.daily_rate}
                onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })}
                min={0}
                step={50}
              />
            </div>
            <div>
              <label className="label">ค่า OT/ชั่วโมง (฿)</label>
              <input
                type="number"
                className="input-field"
                value={form.ot_rate}
                onChange={(e) => setForm({ ...form, ot_rate: Number(e.target.value) })}
                min={0}
                step={10}
              />
            </div>
            <div>
              <label className="label">ค่าคอมมิชชั่น (%)</label>
              <input
                type="number"
                className="input-field"
                value={form.commission_rate}
                onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })}
                min={0}
                max={100}
                step={0.5}
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p>
              รายได้ = ค่าแรงรายวัน + (OT × ชั่วโมง OT) + (ยอดขาย × {form.commission_rate}%)
            </p>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ลงทะเบียนใบหน้า (Face ID)</h2>

          {faceCaptured ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-green-800">บันทึกใบหน้าสำเร็จ</p>
                <p className="text-sm text-green-600">ข้อมูลใบหน้าถูกบันทึกเรียบร้อยแล้ว</p>
              </div>
              <button
                type="button"
                onClick={() => { setFaceCaptured(false); setFaceDescriptor(null) }}
                className="ml-auto text-sm text-green-700 hover:underline"
              >
                ถ่ายใหม่
              </button>
            </div>
          ) : (
            <>
              {!cameraOn ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">เปิดกล้องเพื่อลงทะเบียนใบหน้า</span>
                  <span className="text-xs">(ไม่บังคับ)</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full max-h-64 object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {!modelsLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
                        <div className="text-center text-white">
                          <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                          <p className="text-sm">กำลังโหลดโมเดล...</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={captureFace}
                      disabled={captureLoading || !modelsLoaded}
                      className="flex-1 btn-primary disabled:opacity-50"
                    >
                      {captureLoading ? 'กำลังจับภาพ...' : 'จับภาพใบหน้า'}
                    </button>
                    <button type="button" onClick={stopCamera} className="btn-secondary">
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">QR Code สำรอง</h2>
          <div className="flex gap-3">
            <input
              type="text"
              className="input-field flex-1 font-mono"
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="จะสร้างอัตโนมัติ หรือกำหนดเอง"
            />
            <button type="button" onClick={generateQR} className="btn-secondary whitespace-nowrap">
              สร้าง QR
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/employees')}
            className="btn-secondary flex-1"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {loading ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
          </button>
        </div>
      </form>
    </div>
  )
}
