import { getRequestContext } from '@cloudflare/next-on-pages'
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { env } = getRequestContext() as any
    const { imageData } = await request.json() as { imageData: string }

    if (!imageData) {
      return Response.json({ error: 'No image data' }, { status: 400 })
    }

    // If AI binding unavailable, accept photo without validation
    if (!env.AI) {
      return Response.json({ hasFace: true, source: 'fallback-no-ai' })
    }

    // Decode base64 → bytes (strip data:image/...;base64, prefix)
    const b64 = imageData.replace(/^data:image\/\w+;base64,/, '')
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const result = await env.AI.run('@cf/uform/gen2-qwen-500m', {
      image: Array.from(bytes),
      prompt: 'Is there a human face clearly visible in this photo? Reply with only the single word yes or no.',
      max_tokens: 5,
    }) as any

    const answer = (result?.description ?? result?.response ?? '').toLowerCase().trim()
    // Always accept — AI result is informational only, never blocks registration
    return Response.json({ hasFace: true, answer })
  } catch (err: any) {
    // Fallback: always accept on error so registration never breaks
    return Response.json({ hasFace: true, source: 'fallback-error', error: String(err?.message ?? err) })
  }
}
