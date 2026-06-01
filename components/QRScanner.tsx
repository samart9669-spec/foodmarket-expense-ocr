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
  const mountedRef = useRef(false)

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      try { scannerRef.current.clear() } catch {}
      scannerRef.current = null
    }
    if (mountedRef.current) setStatus('idle')
  }

  const startScanner = async () => {
    setStatus('starting')
    setError(null)

    // Wait one frame so the qr-video-element div is rendered and visible before Html5Qrcode attaches
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => setTimeout(r, 50))

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const el = document.getElementById('qr-video-element')
      if (!el) throw new Error('element not found')

      const scanner = new Html5Qrcode('qr-video-element')
      scannerRef.current = scanner

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
      if (mountedRef.current) setStatus('scanning')
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '')
      let errText = 'ไม่สามารถเปิดกล้องได้'
      if (/permission|denied|notallowed/i.test(msg)) {
        errText = 'กรุณาอนุญาตกล้องในเบราว์เซอร์ แล้วโหลดหน้าใหม่'
      } else if (/notfound|devicenotfound/i.test(msg)) {
        errText = 'ไม่พบกล้องในอุปกรณ์นี้'
      } else if (msg) {
        errText = 'เปิดกล้องไม่ได้: ' + msg.slice(0, 80)
      }
      if (mountedRef.current) { setError(errText); setStatus('error') }
      await stopScanner()
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (!isActive) stopScanner()
  }, [isActive])

  const isOpen = status === 'starting' || status === 'scanning'

  return (
    <div className="p-4 space-y-3">
      {/* Always rendered so Html5Qrcode can find the element; visible when opening/scanning */}
      <div
        id="qr-video-element"
        style={{
          display: isOpen ? 'block' : 'none',
          minHeight: isOpen ? 280 : 0,
          borderRadius: 12,
          overflow: 'hidden',
          width: '100%',
          background: '#000',
        }}
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
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-blue-400">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">กำลังเปิดกล้อง...</p>
        </div>
      )}

      {status === 'scanning' && (
        <>
          <p className="text-center text-gray-400 text-xs">จ่อ QR Code ให้อยู่ในกรอบสี่เหลี่ยม</p>
          <button
            onClick={stopScanner}
            className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm font-medium transition-colors"
          >
            ปิดกล้อง
          </button>
        </>
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
            onClick={() => { setError(null); setStatus('idle') }}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium"
          >
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  )
}
