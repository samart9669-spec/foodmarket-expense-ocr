import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin1234'

function getAdminCredentials(): { username: string; password: string } {
  try {
    const { env } = getRequestContext() as any
    return {
      username: (env.ADMIN_USERNAME as string) || DEFAULT_USERNAME,
      password: (env.ADMIN_PASSWORD as string) || DEFAULT_PASSWORD,
    }
  } catch {
    return { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }
  }
}

// Token format: btoa("username:password")
export function verifyCredentials(username: string, password: string): string | null {
  const creds = getAdminCredentials()
  if (username !== creds.username || password !== creds.password) return null
  return btoa(`${username}:${password}`)
}

export function isAdminAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    const decoded = atob(auth.slice(7))
    const colon = decoded.indexOf(':')
    if (colon < 0) return false
    const username = decoded.slice(0, colon)
    const password = decoded.slice(colon + 1)
    const creds = getAdminCredentials()
    return username === creds.username && password === creds.password
  } catch { return false }
}
