'use client'

import { useEffect, useRef, useState } from 'react'
import {
  analyzeFacePhoto, evaluateFaceFit, loadFaceApi,
  FACE_VIEW_ASPECT, FACE_GUIDE_HEIGHT, type FaceFit,
} from '@/lib/face'

interface FaceCaptureProps {
  /** ได้รูปที่ครอปแล้วกับ descriptor พร้อมเก็บลงระบบ */
  onCaptured: (result: { photo: string; descriptor: string }) => void
  onCancel: () => void
}

// ต้องอยู่ในกรอบต่อเนื่องกี่รอบตรวจ ถึงจะกดถ่ายได้ — กันภาพที่ใบหน้าแค่ผ่านกรอบไปเฉย ๆ
const STEADY_FRAMES = 3
const CHECK_MS = 350

const RING: Record<FaceFit['level'], string> = {
  none: 'border-red-400',
  far: 'border-amber-400',
  close: 'border-amber-400',
  off: 'border-amber-400',
  ok: 'border-green-400',
}

/**
 * กล้องถ่ายใบหน้าตอนลงทะเบียนพนักงาน มีกรอบวงรีให้จัดหน้า และถ่ายได้ก็ต่อเมื่อ
 * ใบหน้าขนาดพอดีกรอบ อยู่กลาง และนิ่งพอ — เดิมถ่ายได้ทันทีแม้ใบหน้าเล็กจนระบบ
 * จดจำไม่ได้
 */
export default function FaceCapture({ onCaptured, onCancel }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceapiRef = useRef<any>(null)
  const busyRef = useRef(false)
  const steadyRef = useRef(0)

  const [ready, setReady] = useState(false)
  const [fit, setFit] = useState<FaceFit>({ ok: false, level: 'none', hint: 'กำลังเตรียมกล้อง...', ratio: 0 })
  const [steady, setSteady] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  // เปิดกล้อง + โหลดโมเดล
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 }, height: { ideal: 960 },
            aspectRatio: { ideal: FACE_VIEW_ASPECT },
          },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      } catch {
        if (!cancelled) setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง')
        return
      }
      try {
        faceapiRef.current = await loadFaceApi()
        if (!cancelled) setReady(true)
      } catch {
        if (!cancelled) setError('โหลดโมเดลตรวจใบหน้าไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่')
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // ตรวจตำแหน่งใบหน้าเป็นระยะ
  useEffect(() => {
    if (!ready) return
    const timer = setInterval(async () => {
      const video = videoRef.current
      const faceapi = faceapiRef.current
      if (!video || !faceapi || busyRef.current || video.readyState < 2 || capturing) return
      busyRef.current = true
      try {
        const vw = video.videoWidth, vh = video.videoHeight
        const scale = Math.min(1, 480 / vw)
        const c = document.createElement('canvas')
        c.width = Math.round(vw * scale); c.height = Math.round(vh * scale)
        c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
        const det = await faceapi.detectSingleFace(
          c, new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.5 }),
        )
        const box = det
          ? { x: det.box.x / scale, y: det.box.y / scale, width: det.box.width / scale, height: det.box.height / scale }
          : null
        const f = evaluateFaceFit(box, vw, vh, { minRatio: 0.45, maxRatio: 0.8 })
        steadyRef.current = f.ok ? steadyRef.current + 1 : 0
        setSteady(steadyRef.current)
        setFit(f.ok && steadyRef.current < STEADY_FRAMES ? { ...f, hint: 'อยู่นิ่ง ๆ สักครู่...' } : f)
      } catch { /* รอบถัดไปค่อยลองใหม่ */ }
      busyRef.current = false
    }, CHECK_MS)
    return () => clearInterval(timer)
  }, [ready, capturing])

  const canShoot = ready && fit.ok && steady >= STEADY_FRAMES && !capturing

  const shoot = async () => {
    const video = videoRef.current
    if (!video || !canShoot) return
    setCapturing(true); setError('')
    const c = document.createElement('canvas')
    c.width = video.videoWidth; c.height = video.videoHeight
    c.getContext('2d')!.drawImage(video, 0, 0)
    // ผ่านการตรวจขนาดและครอปให้พอดีเหมือนรูปที่อัปโหลด
    const r = await analyzeFacePhoto(c.toDataURL('image/jpeg', 0.92))
    if (!r.ok || !r.photo || !r.descriptor) {
      setError(r.reason || 'ถ่ายไม่สำเร็จ ลองใหม่อีกครั้ง')
      steadyRef.current = 0; setSteady(0)
      setCapturing(false)
      return
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    onCaptured({ photo: r.photo, descriptor: r.descriptor })
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black mx-auto w-full max-w-md" style={{ aspectRatio: String(FACE_VIEW_ASPECT) }}>
        <video ref={videoRef} autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

        {/* กรอบวงรี — ส่วนนอกกรอบหรี่ลงเพื่อให้โฟกัสที่ใบหน้า */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`border-4 rounded-[50%] transition-colors ${RING[fit.level]}`}
            style={{
              height: `${FACE_GUIDE_HEIGHT * 100}%`,
              aspectRatio: '0.78',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
            }}
          />
        </div>

        <p className={`absolute bottom-3 left-3 right-3 text-center text-sm font-medium rounded-lg py-1.5 ${
          fit.ok && steady >= STEADY_FRAMES ? 'bg-green-600 text-white' : 'bg-black/60 text-white'
        }`}>
          {!ready && !error ? 'กำลังเตรียมกล้องและโมเดลตรวจใบหน้า...' : fit.ok && steady >= STEADY_FRAMES ? 'พร้อมถ่ายแล้ว' : fit.hint}
        </p>
      </div>

      <p className="text-xs text-gray-500 text-center">
        ให้ใบหน้าเต็มกรอบวงรี มองตรงกล้อง แสงสว่างพอ ไม่สวมแว่นดำหรือหมวกบังหน้า
      </p>

      {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={shoot} disabled={!canShoot}
          className="flex-1 btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
          {capturing ? 'กำลังประมวลผล...' : canShoot ? 'ถ่ายภาพ' : 'จัดใบหน้าให้พอดีกรอบก่อน'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">ยกเลิก</button>
      </div>
    </div>
  )
}
