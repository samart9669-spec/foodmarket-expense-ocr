export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface GeoTarget {
  label: string
  latitude: number
  longitude: number
  radius: number
}

export const DEFAULT_RADIUS_METERS = 200

// Resolve the location an employee must be near for check-in/out:
// a specific branch when one applies, otherwise the head office.
// Returns null when no GPS is configured for the resolved place (no check).
export async function getGeoTarget(db: any, salesPointId: string | null): Promise<GeoTarget | null> {
  if (salesPointId) {
    const branch = await db.prepare('SELECT name, latitude, longitude, radius_meters FROM sales_points WHERE id = ?')
      .bind(salesPointId).first() as any
    if (branch?.latitude != null && branch?.longitude != null) {
      return {
        label: `สาขา${branch.name ? ` ${branch.name}` : ''}`,
        latitude: branch.latitude,
        longitude: branch.longitude,
        radius: branch.radius_meters ?? DEFAULT_RADIUS_METERS,
      }
    }
    return null
  }
  return getHeadOffice(db)
}

export async function getHeadOffice(db: any): Promise<GeoTarget | null> {
  let rows: any
  try {
    rows = await db.prepare(
      "SELECT key, value FROM app_settings WHERE key IN ('head_office_lat','head_office_lng','head_office_radius')"
    ).all()
  } catch {
    // app_settings table not created yet (migrate not run) — no head office check
    return null
  }
  const map: Record<string, string> = {}
  for (const r of rows.results || []) map[r.key] = r.value
  const lat = map.head_office_lat ? parseFloat(map.head_office_lat) : null
  const lng = map.head_office_lng ? parseFloat(map.head_office_lng) : null
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null
  const radius = parseInt(map.head_office_radius) || DEFAULT_RADIUS_METERS
  return { label: 'สำนักงานใหญ่', latitude: lat, longitude: lng, radius }
}

// Returns a Response-ready error object when the position is missing or out of
// range, or null when the location is acceptable.
export function validateGeoPosition(
  target: GeoTarget | null,
  latitude: number | null | undefined,
  longitude: number | null | undefined
): { error: string; distance?: number; required?: number } | null {
  if (!target) return null
  if (latitude == null || longitude == null) {
    return { error: 'ไม่พบตำแหน่ง GPS กรุณาเปิดอนุญาตการเข้าถึงตำแหน่งแล้วลองใหม่' }
  }
  const dist = getDistanceMeters(latitude, longitude, target.latitude, target.longitude)
  if (dist > target.radius) {
    return {
      error: `อยู่ห่างจาก${target.label} ${Math.round(dist)} เมตร (ต้องอยู่ภายใน ${target.radius} เมตร)`,
      distance: Math.round(dist),
      required: target.radius,
    }
  }
  return null
}
