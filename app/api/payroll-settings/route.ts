import { getRequestContext } from '@cloudflare/next-on-pages'

export const runtime = 'edge'

export async function GET() {
  const { env } = getRequestContext()
  const result = await env.DB.prepare('SELECT * FROM payroll_settings ORDER BY category, key').all()
  return Response.json({ settings: result.results })
}

export async function PATCH(request: Request) {
  const { env } = getRequestContext()
  const body = await request.json() as Record<string, string>
  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare('UPDATE payroll_settings SET value=? WHERE key=?').bind(String(value), key).run()
  }
  return Response.json({ ok: true })
}
