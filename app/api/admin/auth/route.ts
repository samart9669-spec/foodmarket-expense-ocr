import { NextRequest } from 'next/server'
import { verifyCredentials, isAdminAuthorized } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json() as { username: string; password: string }
    if (!username || !password) {
      return Response.json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }, { status: 400 })
    }
    const token = verifyCredentials(username, password)
    if (!token) {
      return Response.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 })
    }
    return Response.json({ token })
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return Response.json({ valid: false }, { status: 401 })
  }
  return Response.json({ valid: true })
}
