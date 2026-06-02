import { NextRequest } from 'next/server'
import { makeAdminToken, isAdminAuthorized } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json() as { password: string }
    const token = makeAdminToken()
    // Verify: re-encode password and compare
    if (btoa(password) !== token) {
      return Response.json({ error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }
    return Response.json({ token })
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// Verify token (for client to check if token is still valid)
export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return Response.json({ valid: false }, { status: 401 })
  }
  return Response.json({ valid: true })
}
