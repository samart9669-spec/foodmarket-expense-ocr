import { getRequestContext } from '@cloudflare/next-on-pages'
import { runMigrations } from '@/lib/migrations'

export const runtime = 'edge'

// Safe migration: add new columns/tables without destroying existing data.
// Runs are idempotent — safe to call multiple times.
// GET is provided so the migration can be run by simply opening the URL.
export async function GET() {
  return POST()
}

export async function POST() {
  try {
    const { env } = getRequestContext()
    const results = await runMigrations(env.DB)
    return Response.json({ ok: true, results })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
