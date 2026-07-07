export type PortalKey = 'admin' | 'coach' | 'client'

const PORTAL_PATHS: Record<PortalKey, string> = {
  admin: '/admin/login',
  coach: '/coach/login',
  client: '/login',
}

/** Resolve the app base URL for login links (env-aware, no hardcoded wrong routes). */
export function resolveAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`

  const port = process.env.PORT?.trim() || '3000'
  return `http://localhost:${port}`
}

export function getPortalLoginUrl(portal: PortalKey, baseUrl = resolveAppBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}${PORTAL_PATHS[portal]}`
}

export function getPortalLoginUrls(baseUrl = resolveAppBaseUrl()): Record<PortalKey, string> {
  return {
    admin: getPortalLoginUrl('admin', baseUrl),
    coach: getPortalLoginUrl('coach', baseUrl),
    client: getPortalLoginUrl('client', baseUrl),
  }
}
