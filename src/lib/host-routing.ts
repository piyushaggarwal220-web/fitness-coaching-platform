const DEFAULT_APP_HOST = 'app.lurvox.in'
const DEFAULT_MARKETING_URL = 'https://www.lurvox.in'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function normalizeHost(host: string | null | undefined): string | null {
  if (!host?.trim()) return null
  return host.split(':')[0].trim().toLowerCase()
}

/** App hostname for production split-domain routing. */
export function getAppHost(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) {
    try {
      return new URL(explicit).host.toLowerCase()
    } catch {
      // Fall through to defaults.
    }
  }

  if (process.env.VERCEL_ENV === 'production') {
    return DEFAULT_APP_HOST
  }

  return null
}

/** Public marketing site base URL (Shopify). */
export function getMarketingBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_MARKETING_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) {
    try {
      const url = new URL(appUrl)
      if (url.hostname.startsWith('app.')) {
        url.hostname = `www.${url.hostname.slice(4)}`
        return url.toString().replace(/\/$/, '')
      }
    } catch {
      // Fall through to default.
    }
  }

  return DEFAULT_MARKETING_URL
}

function getMarketingHost(): string {
  return new URL(getMarketingBaseUrl()).host.toLowerCase()
}

function getApexHost(marketingHost: string): string {
  return marketingHost.startsWith('www.') ? marketingHost.slice(4) : marketingHost
}

function isPreviewDeploymentHost(host: string): boolean {
  return host.endsWith('.vercel.app')
}

/**
 * Production host routing while DNS transitions:
 * - app host `/` -> Shopify marketing site
 * - www/apex still on Vercel -> marketing `/`, app paths -> app subdomain
 */
export function resolveProductionHostRedirect(
  hostHeader: string | null | undefined,
  pathname: string,
  search: string
): string | null {
  const host = normalizeHost(hostHeader)
  if (!host || LOCAL_HOSTS.has(host) || isPreviewDeploymentHost(host)) {
    return null
  }

  const appHost = getAppHost()
  if (!appHost) return null

  const marketingUrl = getMarketingBaseUrl()
  const marketingHost = getMarketingHost()
  const apexHost = getApexHost(marketingHost)
  const appOrigin = `https://${appHost}`

  if (host === appHost && pathname === '/') {
    return marketingUrl
  }

  if (host === marketingHost || host === apexHost) {
    if (pathname === '/') {
      return marketingUrl
    }
    return `${appOrigin}${pathname}${search}`
  }

  return null
}
