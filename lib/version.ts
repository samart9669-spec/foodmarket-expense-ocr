// Bump APP_VERSION whenever a change is deployed so the running build is
// identifiable from the UI. BUILD_TIME is stamped automatically at build time
// (see next.config.mjs) — it reflects when the deployment was compiled.
export const APP_VERSION = '1.4.1'

export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || ''

/** Build time as Bangkok wall-clock, e.g. "27/07/2569 15:45" */
export function formatBuildTime(): string {
  if (!BUILD_TIME) return 'dev'
  const d = new Date(BUILD_TIME)
  if (Number.isNaN(d.getTime())) return 'dev'
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/** Compact label for footers: "v1.3.0 · อัปเดต 27/07/2569 15:45" */
export function versionLabel(): string {
  return `v${APP_VERSION} · อัปเดต ${formatBuildTime()}`
}
