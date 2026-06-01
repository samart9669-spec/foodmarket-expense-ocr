'use client'

import { useEffect, useRef, useState } from 'react'

interface QRScannerProps {
  onScan: (code: string) => void
  isActive?: boolean
}

type Status = 'idle' | 'starting' | 'scanning' | 'error'

export default function QRScanner({ onScan, isActive = true }: QRScannerProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<any>(null)
  const lastScanRef = useRef<string | null>(null)

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      try { scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
    setStatus('idle')
  }

  const startScanner = async () => {
    setStatus('starting')
    setError(null)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-video-element')
      scannerRef.current = scanner

      // Use facingMode directly — avoids getCameras() which fails on iOS before permission
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
        (decoded: string) => {
          if (lastScanRef.current === decoded) return
          lastScanRef.current = decoded
          setTimeout(() => { lastScanRef.current = null }, 3000)
          onScan(decoded)
        },
        undefined
      )
      setStatus('scanning')
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '')
      if (msg.includes('Permission') || msg.includes('permission') || msg.includes('denied')) {
        setError('กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่า แล้วโหลดหน้าใหม่')
      } else if (msg.includes('NotFound') || msg.includes('not found')) {
        setError('ไม่พบกล้องในอุปกรณ์นี้')
      } else {
        setError('ไม่สามารถเปิดกล้องได้ — ' + (msg || 'ลองโหลดหน้าใหม่'))
      }
      setStatus('error')
    }
  }

  // stop when tab becomes inactive
  useEffect(() => {
    if (!isActive) { stopScanner() }
  }, [isActive])

  // cleanup on unmount
  useEffect(() => {
    return () => { stopScanner() }
  }, [])

  return (
    <div className="p-4 space-y-3">
      {/* Camera viewport — always in DOM so Html5Qrcode can attach */}
      <div
        id="qr-video-element"
        className={`w-full rounded-xl overflow-hidden ${status === 'scanning' ? 'block' : 'hidden'}`}
        style={{ minHeight: 280 }}
      />

      {status === 'idle' && (
        <button
          onClick={startScanner}
          className="w-full py-5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-colors"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          เปิดกล้องสแกน QR
        </button>
      )}

      {status === 'starting' && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-blue-400">
          <div className="w-10 h-10 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
          <p className="text-sm">กำลังเปิดกล้อง...</p>
        </div>
      )}

      {status === 'scanning' && (
        <button
          onClick={stopScanner}
          className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm font-medium transition-colors"
        >
          ปิดกล้อง
        </button>
      )}

      {status === 'error' && (
        <div className="text-center space-y-3 py-6">
          <div className="w-14 h-14 bg-red-900 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-red-400 text-sm px-4">{error}</p>
          <button
            onClick={() => { setStatus('idle'); setError(null) }}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {status === 'scanning' && (
        <p className="text-center text-gray-500 text-xs">จ่อ QR Code ให้อยู่ในกรอบ</p>
      )}
    </div>
  )
}
