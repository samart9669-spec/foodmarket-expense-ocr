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
        // Dynamically import html5-qrcode
        const { Html5QrcodeScanner } = await import('html5-qrcode')

        html5QrcodeScanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: false,
            defaultZoomValueIfSupported: 1,
          },
          false
        )

        ;(html5QrcodeScanner as { render: (success: (code: string) => void, error: (err: unknown) => void) => void }).render(
          (decodedText: string) => {
            // Debounce: don't fire same code twice in 3 seconds
            if (lastScanRef.current === decodedText) return
            lastScanRef.current = decodedText
            setTimeout(() => {
              lastScanRef.current = null
            }, 3000)
            onScan(decodedText)
          },
          () => {
            // QR scan error - ignore
          }
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
        try {
          ;(scannerRef.current as { clear: () => Promise<void> }).clear().catch(() => {})
        } catch {
          // ignore cleanup errors
        }
        scannerRef.current = null
      }
    }
  }, [isActive, onScan])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-100 rounded-xl">
        <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        id="qr-reader"
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ minHeight: '300px' }}
      />
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
