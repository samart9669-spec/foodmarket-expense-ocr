'use client'

import { useEffect, useState } from 'react'

export type GpsStatus = 'loading' | 'ok' | 'denied' | 'unsupported'

export interface GpsCoords {
  lat: number
  lng: number
}

export function useGeolocation() {
  const [coords, setCoords] = useState<GpsCoords | null>(null)
  const [status, setStatus] = useState<GpsStatus>('loading')

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('ok')
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  return { coords, status }
}
