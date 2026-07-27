/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['face-api.js'],
  },
  env: {
    // Stamped when the deployment is compiled — shown in the UI so the running
    // build can be identified at a glance.
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

// Local dev only: expose Cloudflare bindings (D1) to `next dev`
// via wrangler's local simulator — uses SQLite in .wrangler/, no network needed.
if (process.env.NODE_ENV === 'development') {
  const { setupDevPlatform } = await import('@cloudflare/next-on-pages/next-dev')
  await setupDevPlatform()
}

export default nextConfig
