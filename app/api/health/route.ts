import { getBangkokDateTimeString, getTodayString, getCurrentTimeString } from '@/lib/utils'

export const runtime = 'edge'

// Quick way to confirm which build a URL is serving.
// bangkok_time must be 7 hours ahead of server_utc_time; if they match,
// the deployment predates the Bangkok-time fix.
export async function GET() {
  const utc = new Date().toISOString().replace('T', ' ').slice(0, 19)
  return Response.json({
    ok: true,
    features: ['bangkok-time', 'offsite-requests', 'head-office-schedule', 'attendance-reports'],
    server_utc_time: utc,
    bangkok_time: getBangkokDateTimeString(),
    bangkok_date: getTodayString(),
    bangkok_clock: getCurrentTimeString(),
  })
}
