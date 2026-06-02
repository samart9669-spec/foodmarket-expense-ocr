import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

const DEFAULT_PASSWORD = 'admin1234'

function getAdminPassword(): string {
  try {
    const { env } = getRequestContext() as any
    return (env.ADMIN_PASSWORD as string) || DEFAULT_PASSWORD
  } catch {
    return DEFAULT_PASSWORD
  }
}

export function isAdminAuthorized(request: NextRequest): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  try {
    const decoded = atob(auth.slice(7))
    return decoded === getAdminPassword()
  } catch { return false }
}

export function makeAdminToken(): string {
  return btoa(getAdminPassword())
}
