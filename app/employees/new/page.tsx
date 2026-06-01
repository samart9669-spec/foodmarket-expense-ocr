'use client'

export const runtime = 'edge'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SalesPoint { id: string; name: string }

/** Compress image via canvas → JPEG base64, max 400px wide */
async function compressImage(src: string, maxPx = 400): Promise<string> {
  const img = new Image()
  img.src = src
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej })
  const ratio = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * ratio)
  const h = Math.round(img.naturalHeight * ratio)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d')!.drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/jpeg', 0.75)
}

type PhotoState = 'idle' | 'camera' | 'previewing' | 'analyzing' | 'done'

export default function NewEmployeePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [form, setForm] = useState({
    name: '', employee_type: 'kitchen', sales_point_id: '',
    daily_rate: 350, ot_rate: 50, commission_rate: 0, phone: '',
  })
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Photo state
  const [photoState, setPhotoState] = useState<PhotoState>('idle')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [hasFace, setHasFace] = useState<boolean | null>(null)
  const [aiNote, setAiNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [qrCode, setQrCode] = useState('')

  useEffect(() => {
    fetch('/api/sales-points').then(r => r.json()).then((d: any) => setSalesPoints(d.salesPoints || []))
  }, [])

  // ── Camera ────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }
      })
      streamRef.current = stream
      setPhotoState('camera')
    } catch {
      setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง')
    }
  }

  useEffect(() => {
    if (photoState !== 'camera' || !videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    videoRef.current.play().catch(() => {})
  }, [photoState])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video) return
    const c = document.createElement('canvas')
    c.width = video.videoWidth || 640
    c.height = video.videoHeight || 480
    c.getContext('2d')!.drawImage(video, 0, 0)
    stopCamera()
    processPhoto(c.toDataURL('image/jpeg', 0.9))
  }

  // ── Upload ────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    const url = URL.createObjectURL(file)
    processPhoto(url)
  }

  // ── AI face analysis ──────────────────────────────────────────────
  const processPhoto = async (src: string) => {
    setPhotoState('previewing')
    setPhotoDataUrl(src)
    setHasFace(null)
    setAiNote('')

    setPhotoState('analyzing')
    try {
      const compressed = await compressImage(src)
      const res = await fetch('/api/face-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: compressed }),
      })
      const data = await res.json() as any
      setHasFace(data.hasFace)
      setAiNote(data.answer ?? '')
      setPhotoDataUrl(compressed) // use compressed version for storage
    } catch {
      setHasFace(null) // unknown → still allow save
    }
    setPhotoState('done')
  }

  const resetPhoto = () => {
    stopCamera()
    setPhotoState('idle')
    setPhotoDataUrl(null)
    setHasFace(null)
    setAiNote('')
  }

  // ── Submit ────────────────────────────────────────────────────────
  const generateQR = () => setQrCode(`EMP-${Date.now().toString(36).toUpperCase()}`)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('กรุณากรอกชื่อพนักงาน'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          face_photo: photoDataUrl || undefined,
          qr_code: qrCode || undefined,
          sales_point_id: form.employee_type === 'sales' ? form.sales_point_id : undefined,
        }),
      })
      const data = await res.json() as any
      if (!res.ok) { setError(data.error || 'เกิดข้อผิดพลาด'); return }
      router.push('/employees')
    } catch { setError('เกิดข้อผิดพลาด กรุณาลองใหม่') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">เพิ่มพนักงานใหม่</h1>
        <p className="text-gray-500 text-sm mt-1">กรอกข้อมูลพนักงานให้ครบถ้วน</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">ข้อมูลพื้นฐาน</h2>
          <div>
            <label className="label">ชื่อ-นามสกุล *</label>
            <input type="text" className="input-field" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น สมชาย ใจดี" required />
          </div>
          <div>
            <label className="label">ประเภทพนักงาน *</label>
            <select className="input-field" value={form.employee_type}
              onChange={e => setForm({ ...form, employee_type: e.target.value })}>
              <option value="kitchen">ครัวกลาง</option>
              <option value="sales">พนักงานขายหน้าร้าน</option>
            </select>
          </div>
          {form.employee_type === 'sales' && (
            <div>
              <label className="label">จุดขายประจำ</label>
              <select className="input-field" value={form.sales_point_id}
                onChange={e => setForm({ ...form, sales_point_id: e.target.value })}>
                <option value="">-- เลือกจุดขาย --</option>
                {salesPoints.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">เบอร์โทรศัพท์</label>
            <input type="tel" className="input-field" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0812345678" />
          </div>
        </div>

        {/* Salary */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">โครงสร้างรายได้</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">ค่าแรงรายวัน (฿)</label>
              <input type="number" className="input-field" value={form.daily_rate}
                onChange={e => setForm({ ...form, daily_rate: Number(e.target.value) })} min={0} step={50} />
            </div>
            <div>
              <label className="label">ค่า OT/ชั่วโมง (฿)</label>
              <input type="number" className="input-field" value={form.ot_rate}
                onChange={e => setForm({ ...form, ot_rate: Number(e.target.value) })} min={0} step={10} />
            </div>
            <div>
              <label className="label">ค่าคอมมิชชั่น (%)</label>
              <input type="number" className="input-field" value={form.commission_rate}
                onChange={e => setForm({ ...form, commission_rate: Number(e.target.value) })} min={0} max={100} step={0.5} />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            รายได้ = ค่าแรงรายวัน + (OT × ชั่วโมง OT) + (ยอดขาย × {form.commission_rate}%)
          </div>
        </div>

        {/* Photo / Face */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">รูปภาพพนักงาน</h2>
          <p className="text-sm text-gray-500">ใช้ Cloudflare AI วิเคราะห์ใบหน้าอัตโนมัติ</p>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* Idle */}
          {photoState === 'idle' && (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={startCamera}
                className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="font-medium text-sm">ถ่ายจากกล้อง</span>
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-purple-400 hover:text-purple-500 transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium text-sm">อัปโหลดรูป</span>
              </button>
            </div>
          )}

          {/* Camera live */}
          {photoState === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-square max-h-80 mx-auto">
                <video ref={videoRef} autoPlay muted playsInline
                  className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-2/3 h-4/5 border-4 border-white border-opacity-60 rounded-[50%]" />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black bg-opacity-50 py-1">
                  จัดใบหน้าให้อยู่ในกรอบ
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={takePhoto}
                  className="flex-1 btn-primary flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  ถ่ายภาพ
                </button>
                <button type="button" onClick={resetPhoto} className="btn-secondary">ยกเลิก</button>
              </div>
            </div>
          )}

          {/* Analyzing */}
          {photoState === 'analyzing' && (
            <div className="flex flex-col items-center py-8 gap-4">
              {photoDataUrl && (
                <div className="w-28 h-28 rounded-xl overflow-hidden border-2 border-gray-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoDataUrl} alt="preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-3 text-blue-600">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Cloudflare AI กำลังวิเคราะห์ใบหน้า...</span>
              </div>
            </div>
          )}

          {/* Done */}
          {photoState === 'done' && photoDataUrl && (
            <div className="space-y-3">
              <div className={`relative w-28 h-28 mx-auto rounded-xl overflow-hidden border-4 ${hasFace === false ? 'border-orange-400' : 'border-green-400'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoDataUrl} alt="face" className="w-full h-full object-cover" />
                {hasFace !== false && (
                  <div className="absolute bottom-0 left-0 right-0 bg-green-500 text-white text-center text-xs py-0.5 font-medium">
                    ✓ พบใบหน้า
                  </div>
                )}
              </div>

              {hasFace === false ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 text-center space-y-2">
                  <p className="font-medium">⚠️ AI ไม่พบใบหน้าในรูป</p>
                  <p className="text-xs text-orange-600">ลองใช้รูปที่เห็นใบหน้าชัดเจน หรือกด "บันทึกรูปนี้ต่อไป" เพื่อใช้รูปนี้</p>
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={resetPhoto}
                      className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium">
                      เปลี่ยนรูป
                    </button>
                    <button type="button" onClick={() => setHasFace(true)}
                      className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium">
                      บันทึกรูปนี้ต่อไป
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-green-800">บันทึกรูปสำเร็จ</p>
                    <p className="text-xs text-green-600">AI ยืนยันพบใบหน้าในรูป</p>
                  </div>
                  <button type="button" onClick={resetPhoto} className="text-xs text-gray-500 hover:underline">เปลี่ยน</button>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">(ไม่บังคับ) ข้ามได้ — ใช้ QR Code สแกนเข้างานแทนได้</p>
        </div>

        {/* QR Code */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900 pb-2 border-b">QR Code สแกนเข้างาน</h2>
          <div className="flex gap-3">
            <input type="text" className="input-field flex-1 font-mono" value={qrCode}
              onChange={e => setQrCode(e.target.value)} placeholder="จะสร้างอัตโนมัติ หรือกำหนดเอง" />
            <button type="button" onClick={generateQR} className="btn-secondary whitespace-nowrap">สร้าง QR</button>
          </div>
        </div>

        {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

        <div className="flex gap-3">
          <button type="button" onClick={() => router.push('/employees')} className="btn-secondary flex-1">ยกเลิก</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
            {loading ? 'กำลังบันทึก...' : 'เพิ่มพนักงาน'}
          </button>
        </div>
      </form>
    </div>
  )
}
