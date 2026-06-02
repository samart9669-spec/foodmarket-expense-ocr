'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Employee {
  id: string
  name: string
  employee_type: string
  face_descriptor: string | null
  face_photo: string | null
}

interface FaceScannerProps {
  employees: Employee[]
  onMatch: (employeeId: string, employeeName: string) => void
  onError?: (error: string) => void
  isActive?: boolean
}

type LoadStatus = 'loading-models' | 'extracting' | 'ready' | 'no-faces' | 'error'

export default function FaceScanner({ employees, onMatch, onError, isActive = true }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const faceapiRef = useRef<any>(null)
  const matcherRef = useRef<any>(null)
  // Refs instead of state to avoid stale-closure bugs in the interval callback
  const lastDetectionRef = useRef<string | null>(null)
  const detectingRef = useRef(false)

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading-models')
  const [loadMsg, setLoadMsg] = useState('กำลังโหลดโมเดลจดจำใบหน้า...')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)

  // ── Load npm package + local models, build face matcher ──────────
  useEffect(() => {
    if (!isActive) return
    let cancelled = false

    const init = async () => {
      try {
        setLoadStatus('loading-models')
        setLoadMsg('กำลังโหลดโมเดลจดจำใบหน้า...')

        // Dynamic import from npm — no CDN dependency
        const faceapi = await import('face-api.js')
        if (cancelled) return
        faceapiRef.current = faceapi

        // Models pre-downloaded to /public/models/ in CI workflow
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        ])
        if (cancelled) return

        // Build descriptors — stored or extracted from face_photo
        setLoadStatus('extracting')
        setLoadMsg('กำลังประมวลผลข้อมูลใบหน้าพนักงาน...')

        const labeled: any[] = []
        for (const emp of employees) {
          if (cancelled) return
          let descriptor: Float32Array | null = null

          // 1. Use stored descriptor if available (fast path)
          if (emp.face_descriptor) {
            try { descriptor = new Float32Array(JSON.parse(emp.face_descriptor)) } catch {}
          }

          // 2. Extract from face_photo and persist back to DB
          if (!descriptor && emp.face_photo) {
            try {
              const img = document.createElement('img')
              img.src = emp.face_photo
              await new Promise<void>((res, rej) => {
                img.onload = () => res()
                img.onerror = () => rej(new Error('load'))
                setTimeout(() => rej(new Error('timeout')), 8000)
              })
              const det = await faceapi
                .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
                .withFaceLandmarks(true)
                .withFaceDescriptor()
              if (det) {
                descriptor = det.descriptor
                // Save so future check-ins skip extraction
                fetch(`/api/employees/${emp.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ face_descriptor: JSON.stringify(Array.from(descriptor)) }),
                }).catch(() => {})
              }
            } catch {}
          }

          if (descriptor) {
            labeled.push(new faceapi.LabeledFaceDescriptors(emp.id, [descriptor]))
          }
        }

        if (cancelled) return

        if (labeled.length === 0) {
          setLoadStatus('no-faces')
          setLoadMsg('ยังไม่มีพนักงานที่มีข้อมูลใบหน้า')
          return
        }

        matcherRef.current = new faceapi.FaceMatcher(labeled, 0.55)
        setLoadStatus('ready')
        setLoadMsg('')
      } catch (err: any) {
        if (!cancelled) {
          const msg = err?.message ?? 'unknown'
          setLoadStatus('error')
          setLoadMsg('โหลดโมเดลไม่สำเร็จ: ' + msg)
          onError?.('โหลดโมเดลไม่สำเร็จ')
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [isActive, employees, onError])

  // ── Camera ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    }).catch(() => {
      setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้อง')
    })
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [isActive])

  // ── Detection loop ────────────────────────────────────────────────
  const detectFace = useCallback(async () => {
    if (detectingRef.current || !faceapiRef.current || !matcherRef.current) return
    if (!videoRef.current || videoRef.current.readyState < 2) return

    detectingRef.current = true
    setDetecting(true)
    try {
      const faceapi = faceapiRef.current
      // Snapshot to canvas first — more reliable on iOS Safari than direct video
      const frame = document.createElement('canvas')
      frame.width = videoRef.current.videoWidth || 640
      frame.height = videoRef.current.videoHeight || 480
      frame.getContext('2d')?.drawImage(videoRef.current, 0, 0)

      const det = await faceapi
        .detectSingleFace(frame, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor()

      if (det) {
        const match = matcherRef.current.findBestMatch(det.descriptor)
        if (match.label !== 'unknown' && lastDetectionRef.current !== match.label) {
          const emp = employees.find(e => e.id === match.label)
          if (emp) {
            lastDetectionRef.current = match.label
            onMatch(emp.id, emp.name)
            setTimeout(() => { lastDetectionRef.current = null }, 3000)
          }
        }
      }
    } catch {}
    detectingRef.current = false
    setDetecting(false)
  }, [employees, onMatch])

  useEffect(() => {
    if (loadStatus !== 'ready') return
    intervalRef.current = setInterval(detectFace, 800)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadStatus, detectFace])

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-100 rounded-xl">
        <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-red-600 font-medium">{cameraError}</p>
      </div>
    )
  }

  const isLoading = loadStatus === 'loading-models' || loadStatus === 'extracting'

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-80 rounded-xl z-10 min-h-[240px]">
          <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mb-3" />
          <p className="text-white text-sm text-center px-4">{loadMsg}</p>
          <p className="text-gray-400 text-xs mt-2">ครั้งแรกอาจใช้เวลา 10–20 วินาที</p>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden bg-black" style={{ minHeight: isLoading ? 240 : 0 }}>
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className="w-full max-h-96 object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />

        {loadStatus === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-green-400 rounded-full opacity-50">
              <div className="w-full h-full border-4 border-transparent border-t-green-400 rounded-full animate-spin" />
            </div>
          </div>
        )}

        {detecting && (
          <div className="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            กำลังสแกน...
          </div>
        )}
      </div>

      {loadStatus === 'no-faces' && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-700 text-sm text-center">
            ยังไม่มีพนักงานที่มีข้อมูลใบหน้า กรุณาลงทะเบียนรูปภาพพนักงานก่อน
          </p>
        </div>
      )}

      {loadStatus === 'error' && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm text-center">{loadMsg}</p>
        </div>
      )}
    </div>
  )
}
