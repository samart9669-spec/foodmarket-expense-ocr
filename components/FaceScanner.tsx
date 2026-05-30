'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface Employee {
  id: string
  name: string
  employee_type: string
  face_descriptor: string | null
}

interface FaceScannerProps {
  employees: Employee[]
  onMatch: (employeeId: string, employeeName: string) => void
  onError?: (error: string) => void
  isActive?: boolean
}


export default function FaceScanner({ employees, onMatch, onError, isActive = true }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [lastDetection, setLastDetection] = useState<string | null>(null)
  const [faceapiLoaded, setFaceapiLoaded] = useState(false)

  useEffect(() => {
    if (window.faceapi) {
      setFaceapiLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js'
    script.async = true
    script.onload = () => setFaceapiLoaded(true)
    script.onerror = () => {
      onError?.('ไม่สามารถโหลด face-api.js ได้')
    }
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [onError])

  useEffect(() => {
    if (!faceapiLoaded) return
    const loadModels = async () => {
      try {
        setLoadingModels(true)
        const faceapi = window.faceapi
        const MODEL_URL = '/models'
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        setModelsLoaded(true)
      } catch {
        onError?.('ไม่สามารถโหลดโมเดลได้ กรุณาตรวจสอบโฟลเดอร์ /public/models/')
      } finally {
        setLoadingModels(false)
      }
    }
    loadModels()
  }, [faceapiLoaded, onError])

  useEffect(() => {
    if (!isActive) return
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้อง')
      }
    }
    startCamera()
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [isActive])

  const detectFace = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !modelsLoaded || !window.faceapi) return
    const video = videoRef.current
    if (video.readyState !== 4) return

    const faceapi = window.faceapi
    setDetecting(true)

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor()

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }

      if (!detection) {
        setDetecting(false)
        return
      }

      if (ctx) {
        const { x, y, width, height } = detection.descriptor ?
          { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight } :
          { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight }
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 3
        ctx.strokeRect(x + 10, y + 10, width - 20, height - 20)
      }

      const registeredEmployees = employees.filter((e) => e.face_descriptor)
      if (registeredEmployees.length === 0) {
        setDetecting(false)
        return
      }

      const labeledDescriptors = registeredEmployees.map((emp) => {
        const descriptorArray = JSON.parse(emp.face_descriptor!) as number[]
        return new faceapi.LabeledFaceDescriptors(emp.id, [new Float32Array(descriptorArray)])
      })

      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6)
      const match = faceMatcher.findBestMatch(detection.descriptor)

      if (match.label !== 'unknown' && match.distance < 0.6) {
        const matchedEmployee = employees.find((e) => e.id === match.label)
        if (matchedEmployee && match.label !== lastDetection) {
          setLastDetection(match.label)
          onMatch(matchedEmployee.id, matchedEmployee.name)
          setTimeout(() => setLastDetection(null), 3000)
        }
      }
    } catch {
      // Detection error - ignore and continue
    } finally {
      setDetecting(false)
    }
  }, [modelsLoaded, employees, onMatch, lastDetection])

  useEffect(() => {
    if (!modelsLoaded || !isActive) return
    intervalRef.current = setInterval(detectFace, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [modelsLoaded, isActive, detectFace])

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

  return (
    <div className="relative">
      {(loadingModels || !faceapiLoaded) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-80 rounded-xl z-10">
          <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mb-3"></div>
          <p className="text-white text-sm">
            {!faceapiLoaded ? 'กำลังโหลด face-api.js...' : 'กำลังโหลดโมเดลจดจำใบหน้า...'}
          </p>
          <p className="text-gray-300 text-xs mt-2">กรุณารอสักครู่</p>
        </div>
      )}

      {!modelsLoaded && !loadingModels && faceapiLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 rounded-xl z-10">
          <svg className="w-10 h-10 text-yellow-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-white font-medium">ไม่พบโมเดลจดจำใบหน้า</p>
          <p className="text-gray-300 text-xs mt-2 text-center px-4">
            กรุณาดาวน์โหลดโมเดลไปยัง /public/models/<br />
            (ดูคำแนะนำใน /public/models/README.md)
          </p>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full max-h-96 object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />

        {modelsLoaded && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-green-400 rounded-full opacity-50">
              <div className="w-full h-full border-4 border-transparent border-t-green-400 rounded-full animate-spin"></div>
            </div>
          </div>
        )}

        {detecting && (
          <div className="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            กำลังสแกน...
          </div>
        )}
      </div>

      {modelsLoaded && employees.filter((e) => e.face_descriptor).length === 0 && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-yellow-700 text-sm text-center">
            ยังไม่มีพนักงานที่ลงทะเบียนใบหน้า กรุณาเพิ่มข้อมูลใบหน้าในหน้าพนักงาน
          </p>
        </div>
      )}
    </div>
  )
}
