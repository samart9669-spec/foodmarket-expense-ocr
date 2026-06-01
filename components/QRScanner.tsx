'use client'

import { useEffect, useRef, useState } from 'react'

interface QRScannerProps {
  onScan: (code: string) => void
  isActive?: boolean
}

export default function QRScanner({ onScan, isActive = true }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const lastScanRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isActive) return
    let html5QrcodeScanner: unknown = null
    const initScanner = async () => {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode')
        html5QrcodeScanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false)
        ;(html5QrcodeScanner as { render: (s: (c: string) => void, e: (e: unknown) => void) => void }).render(
          (decodedText: string) => {
            if (lastScanRef.current === decodedText) return
            lastScanRef.current = decodedText
            setTimeout(() => { lastScanRef.current = null }, 3000)
            onScan(decodedText)
          },
          () => {}
        )
        scannerRef.current = html5QrcodeScanner
        setScanning(true)
      } catch {
        setError('ไม่สามารถเริ่มสแกน QR Code ได้')
      }
    }
    initScanner()
    return () => {
      if (scannerRef.current) {
        try { ;(scannerRef.current as { clear: () => Promise<void> }).clear().catch(() => {}) } catch {}
        scannerRef.current = null
      }
    }
  }, [isActive, onScan])

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 bg-gray-100 rounded-xl">
      <p className="text-red-600 font-medium">{error}</p>
    </div>
  )

  return (
    <div className="relative">
      <div id="qr-reader" ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ minHeight: '300px' }} />
      {!scanning && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-gray-600 text-sm">กำลังเปิดกล้อง...</p>
          </div>
        </div>
      )}
    </div>
  )
}
