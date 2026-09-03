import { getRequestContext } from '@cloudflare/next-on-pages'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { generateId } from '@/lib/utils'
import { normalizeBasis } from '@/lib/incentive'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

// เกณฑ์ incentive แบบขั้นบันไดของแต่ละสาขา

async function ensureTable(db: any) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS incentive_tiers (
      id TEXT PRIMARY KEY,
      sales_point_id TEXT NOT NULL,
      shift_id TEXT,
      min_sales REAL NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `).run()
  try {
    await db.prepare("ALTER TABLE sales_points ADD COLUMN incentive_basis TEXT DEFAULT 'daily'").run()
  } catch {
    // already present
  }
}

export async function GET(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    await ensureTable(db)

    const [tiersRes, pointsRes, shiftsRes] = await Promise.all([
      db.prepare('SELECT * FROM incentive_tiers ORDER BY sales_point_id, min_sales ASC').all(),
      db.prepare('SELECT id, name, incentive_rate, incentive_basis FROM sales_points ORDER BY name').all(),
      db.prepare('SELECT id, name, start_time, end_time FROM shifts ORDER BY start_time').all(),
    ])

    return Response.json({
      tiers: tiersRes.results || [],
      sales_points: (pointsRes.results || []).map((p: any) => ({
        ...p,
        incentive_basis: normalizeBasis(p.incentive_basis),
      })),
      shifts: shiftsRes.results || [],
    })
  } catch (error) {
    console.error('GET /api/incentive-tiers error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

/**
 * Replaces the whole scale for one branch in a single call — the settings
 * screen edits the rows as a group, so a partial save would be confusing.
 */
export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext()
    const db = env.DB
    const user = await isAdminAuthorized(request, db, 'manager')
    if (!user) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await ensureTable(db)

    const body = await request.json().catch(() => ({})) as {
      sales_point_id?: string
      incentive_basis?: string
      tiers?: Array<{ shift_id?: string | null; min_sales: number; amount: number }>
    }

    const salesPointId = body.sales_point_id
    if (!salesPointId) return Response.json({ error: 'ต้องระบุสาขา' }, { status: 400 })

    const tiers = (body.tiers || [])
      .map(t => ({
        shift_id: t.shift_id || null,
        min_sales: Number(t.min_sales) || 0,
        amount: Number(t.amount) || 0,
      }))
      // A tier that pays nothing is not a tier
      .filter(t => t.amount > 0)

    await db.prepare('DELETE FROM incentive_tiers WHERE sales_point_id = ?').bind(salesPointId).run()

    for (const t of tiers) {
      await db.prepare(
        'INSERT INTO incentive_tiers (id, sales_point_id, shift_id, min_sales, amount) VALUES (?, ?, ?, ?, ?)'
      ).bind(generateId(), salesPointId, t.shift_id, t.min_sales, t.amount).run()
    }

    if (body.incentive_basis) {
      await db.prepare('UPDATE sales_points SET incentive_basis = ? WHERE id = ?')
        .bind(normalizeBasis(body.incentive_basis), salesPointId).run()
    }

    return Response.json({ success: true, saved: tiers.length })
  } catch (error) {
    console.error('POST /api/incentive-tiers error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
