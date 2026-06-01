'use client'

export const runtime = 'edge'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const FACEAPI_MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'

interface SalesPoint {
  id: string
  name: string
}

function snapshotCanvas(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  canvas.getContext('2d')?.drawImage(video, 0, 0)
  return canvas
}

export default function NewEmployeePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const stableCountRef = useRef(0)
  const detectionActiveRef = useRef(true)
  const attemptsRef = useRef(0)

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

  // Face enrollment state
  const [faceMode, setFaceMode] = useState<'idle' | 'camera' | 'upload'>('idle')
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null)
  const [faceCaptured, setFaceCaptured] = useState(false)
  const [faceapiLoaded, setFaceapiLoaded] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)

  // Camera state
  const [cameraOn, setCameraOn] = useState(false)
  const [faceInFrame, setFaceInFrame] = useState(false)
  const [progress, setProgress] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [forceCapturing, setForceCapturing] = useState(false)
  const [loopKey, setLoopKey] = useState(0)

  // Upload state
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [uploadDetecting, setUploadDetecting] = useState(false)
  const [uploadError, setUploadError] = useState('')

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

  // ── Camera helpers ──────────────────────────────────────────────
  const startCamera = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      })
      streamRef.current = stream
      stableCountRef.current = 0
      attemptsRef.current = 0
      detectionActiveRef.current = true
      setProgress(0)
      setAttempts(0)
      setFaceInFrame(false)
      setCameraOn(true)
      setFaceMode('camera')
    } catch {
      setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องและลองใหม่')
    }
  }

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return
    const video = videoRef.current
    video.srcObject = streamRef.current
    video.play().catch(() => {})
  }, [cameraOn])

  const stopCamera = () => {
    detectionActiveRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOn(false)
  }

  useEffect(() => {
    if (!cameraOn || !modelsLoaded) return
    let timer: ReturnType<typeof setTimeout> | null = null
    detectionActiveRef.current = true

    const detect = async () => {
      if (!detectionActiveRef.current) return
      const video = videoRef.current
      if (!video || video.readyState !== 4) { timer = setTimeout(detect, 300); return }

      try {
        const frame = snapshotCanvas(video)
        const detection = await window.faceapi
          .detectSingleFace(frame, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (!detectionActiveRef.current) return
        attemptsRef.current += 1
        setAttempts(attemptsRef.current)

        if (detection && detection.descriptor) {
          stableCountRef.current += 1
          setFaceInFrame(true)
          setProgress(stableCountRef.current)
          if (stableCountRef.current >= 2) {
            detectionActiveRef.current = false
            setFaceDescriptor(Array.from(detection.descriptor))
            setFaceCaptured(true)
            stopCamera()
            return
          }
        } else {
          stableCountRef.current = 0
          setFaceInFrame(false)
          setProgress(0)
        }
      } catch { /* continue */ }

      if (detectionActiveRef.current) timer = setTimeout(detect, 600)
    }

    detect()
    return () => { if (timer) clearTimeout(timer) }
  }, [cameraOn, modelsLoaded, loopKey])

  const forceCapture = async () => {
    if (!videoRef.current || !modelsLoaded || forceCapturing) return
    setForceCapturing(true)
    detectionActiveRef.current = false
    try {
      const video = videoRef.current
      if (video.readyState !== 4) {
        await new Promise<void>((resolve) => {
          const onReady = () => { video.removeEventListener('canplay', onReady); resolve() }
          video.addEventListener('canplay', onReady)
          setTimeout(resolve, 3000)
        })
      }
      const frame = snapshotCanvas(video)
      const detectionPromise = window.faceapi
        .detectSingleFace(frame, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
      const detection = await Promise.race([detectionPromise, timeoutPromise])

      if (detection && detection.descriptor) {
        setFaceDescriptor(Array.from(detection.descriptor))
        setFaceCaptured(true)
        stopCamera()
      } else {
        alert('ไม่พบใบหน้าในกล้อง ลองขยับตำแหน่ง เพิ่มแสง แล้วกดอีกครั้ง')
        stableCountRef.current = 0
        setLoopKey((k) => k + 1)
      }
    } catch {
      alert('เกิดข้อผิดพลาดในการจับภาพ')
      stableCountRef.current = 0
      setLoopKey((k) => k + 1)
    } finally {
      setForceCapturing(false)
    }
  }

  // ── Upload helpers ──────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      return
    }

    setUploadError('')
    setUploadDetecting(true)
    setFaceMode('upload')

    // Create preview URL
    const previewUrl = URL.createObjectURL(file)
    setUploadPreview(previewUrl)

    try {
      // Wait for models
      if (!modelsLoaded) {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (modelsLoaded) { clearInterval(check); resolve() }
          }, 300)
          setTimeout(() => { clearInterval(check); resolve() }, 30000)
        })
      }

      // Load image into HTMLImageElement then draw to canvas
      const img = new Image()
      img.src = previewUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('โหลดรูปไม่ได้'))
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')?.drawImage(img, 0, 0)

      const detection = await window.faceapi
        .detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.2 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (detection && detection.descriptor) {
        setFaceDescriptor(Array.from(detection.descriptor))
        setFaceCaptured(true)
      } else {
        setUploadError('ไม่พบใบหน้าในรูปภาพ กรุณาใช้รูปที่เห็นใบหน้าชัดเจน หันหน้าตรง มีแสงเพียงพอ')
      }
    } catch (err: any) {
      setUploadError(err?.message || 'เกิดข้อผิดพลาดในการประมวลผลรูปภาพ')
    } finally {
      setUploadDetecting(false)
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const resetFace = () => {
    setFaceCaptured(false)
    setFaceDescriptor(null)
    setFaceMode('idle')
    setUploadPreview(null)
    setUploadError('')
    stopCamera()
    setCameraOn(false)
  }

  // ── Form submit ─────────────────────────────────────────────────
  const generateQR = () => setQrCode(`EMP-${Date.now().toString(36).toUpperCase()}`)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('กรุณากรอกชื่อพนักงาน'); return }
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
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      router.push('/employees')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const frameColor = !modelsLoaded ? 'border-gray-400' : faceInFrame ? 'border-green-400' : 'border-yellow-400'
  const statusText = !modelsLoaded
    ? 'กำลังโหลดโมเดล...'
    : progress >= 2 ? '✓ บันทึกสำเร็จ!'
    : faceInFrame ? `กำลังจับ... (${progress}/2) อย่าขยับ`
    : `วางใบหน้าให้อยู่ในกรอบ${attempts > 0 ? ` (ตรวจแล้ว ${attempts} รอบ)` : ''}`

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มพนักงานใหม่</h1>
        <p className="text-gray-500 text-sm mt-1">กรอกข้อมูลพนักงานให้ครบถ้วน</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Basic info ── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ข้อมูลพื้นฐาน</h2>
          <div>
            <label className="label">ชื่อ-นามสกุล *</label>
            <input type="text" className="input-field" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="เช่น สมชาย ใจดี" required />
          </div>
          <div>
            <label className="label">ประเภทพนักงาน *</label>
            <select className="input-field" value={form.employee_type}
              onChange={(e) => setForm({ ...form, employee_type: e.target.value })}>
              <option value="kitchen">ครัวกลาง</option>
              <option value="sales">พนักงานขายหน้าร้าน</option>
            </select>
          </div>
          {form.employee_type === 'sales' && (
            <div>
              <label className="label">จุดขายประจำ</label>
              <select className="input-field" value={form.sales_point_id}
                onChange={(e) => setForm({ ...form, sales_point_id: e.target.value })}>
                <option value="">-- เลือกจุดขาย --</option>
                {salesPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input type="tel" className="input-field" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0812345678" />
          </div>
        </div>

        {/* ── Salary structure ── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">โครงสร้างรายได้</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">ค่าแรงรายวัน (฿)</label>
              <input type="number" className="input-field" value={form.daily_rate}
                onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })} min={0} step={50} />
            </div>
            <div>
              <label className="label">ค่า OT/ชั่วโมง (฿)</label>
              <input type="number" className="input-field" value={form.ot_rate}
                onChange={(e) => setForm({ ...form, ot_rate: Number(e.target.value) })} min={0} step={10} />
            </div>
            <div>
              <label className="label">ค่าคอมมิชชั่น (%)</label>
              <input type="number" className="input-field" value={form.commission_rate}
                onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} min={0} max={100} step={0.5} />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            รายได้ = ค่าแรงรายวัน + (OT × ชั่วโมง OT) + (ยอดขาย × {form.commission_rate}%)
          </div>
        </div>

        {/* ── Face enrollment ── */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ลงทะเบียนใบหน้า (Face ID)</h2>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Success state */}
          {faceCaptured ? (
            <div className="space-y-3">
              {uploadPreview && (
                <div className="relative w-32 h-32 mx-auto rounded-xl overflow-hidden border-4 border-green-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={uploadPreview} alt="face preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <svg className="w-8 h-8 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="font-medium text-green-800">บันทึกใบหน้าสำเร็จ</p>
                  <p className="text-sm text-green-600">
                    {faceMode === 'upload' ? 'จากไฟล์รูปภาพ' : 'จากกล้องถ่ายรูป'}
                  </p>
                </div>
                <button type="button" onClick={resetFace} className="text-sm text-green-700 hover:underline">
                  เปลี่ยนรูป
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Idle — show two entry points */}
              {faceMode === 'idle' && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-medium text-sm">ถ่ายรูปจากกล้อง</span>
                    <span className="text-xs text-gray-400">สแกนใบหน้าอัตโนมัติ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFaceMode('upload'); fileInputRef.current?.click() }}
                    className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-purple-400 hover:text-purple-500 transition-colors"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-sm">อัปโหลดรูปภาพ</span>
                    <span className="text-xs text-gray-400">JPG, PNG จากอัลบั้ม</span>
                  </button>
                </div>
              )}

              {/* Upload mode */}
              {faceMode === 'upload' && (
                <div className="space-y-3">
                  {uploadDetecting ? (
                    <div className="flex flex-col items-center py-8 gap-3">
                      {uploadPreview && (
                        <div className="w-32 h-32 rounded-xl overflow-hidden border-2 border-gray-300">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={uploadPreview} alt="preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                      <p className="text-gray-600 text-sm">กำลังตรวจจับใบหน้า...</p>
                    </div>
                  ) : uploadError ? (
                    <div className="space-y-3">
                      {uploadPreview && (
                        <div className="w-32 h-32 mx-auto rounded-xl overflow-hidden border-2 border-red-300 opacity-60">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={uploadPreview} alt="preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm text-center">{uploadError}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 btn-primary text-sm"
                        >
                          เลือกรูปใหม่
                        </button>
                        <button type="button" onClick={resetFace} className="btn-secondary text-sm">
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Camera mode */}
              {faceMode === 'camera' && cameraOn && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-h-96 mx-auto">
                    <video ref={videoRef} autoPlay muted playsInline
                      className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className={`w-3/4 h-5/6 border-4 ${frameColor} rounded-[50%] transition-colors duration-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]`} />
                    </div>
                    {faceInFrame && progress > 0 && (
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {[1, 2].map((i) => (
                          <div key={i} className={`w-3 h-3 rounded-full transition-colors ${progress >= i ? 'bg-green-400' : 'bg-white bg-opacity-40'}`} />
                        ))}
                      </div>
                    )}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black bg-opacity-70 rounded-full max-w-[90%]">
                      <p className={`text-sm font-medium text-center ${faceInFrame ? 'text-green-300' : 'text-white'}`}>{statusText}</p>
                    </div>
                    {!modelsLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
                        <div className="text-center text-white">
                          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2"></div>
                          <p className="text-sm">กำลังโหลดโมเดล...</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={forceCapture} disabled={!modelsLoaded || forceCapturing}
                      className="flex-1 btn-primary disabled:opacity-50">
                      {forceCapturing ? 'กำลังจับภาพ...' : 'จับภาพตอนนี้'}
                    </button>
                    <button type="button" onClick={resetFace} className="btn-secondary">ยกเลิก</button>
                  </div>
                  <p className="text-xs text-gray-500 text-center">
                    หากกรอบยังเหลืองอยู่ ให้กด จับภาพตอนนี้ เพื่อบังคับบันทึก
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">(ไม่บังคับ) สามารถข้ามและบันทึกพนักงานโดยไม่มีใบหน้าได้</p>
            </>
          )}
        </div>

        {/* ── QR Code ── */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">QR Code สำรอง</h2>
          <div className="flex gap-3">
            <input type="text" className="input-field flex-1 font-mono" value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="จะสร้างอัตโนมัติ หรือกำหนดเอง" />
            <button type="button" onClick={generateQR} className="btn-secondary whitespace-nowrap">สร้าง QR</button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => router.push('/employees')} className="btn-secondary flex-1">
            ยกเลิก
          </button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
            {loading ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
          </button>
        </div>
      </form>
    </div>
  )
}
