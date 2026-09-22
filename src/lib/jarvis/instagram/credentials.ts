/**
 * Instagram Login credentials for Jarvis organic Instagram Operator.
 * Uses INSTAGRAM_ACCESS_TOKEN (graph.instagram.com) — NOT META_ADS_ACCESS_TOKEN.
 * Meta Ads continues to use META_ADS_* separately. Secrets never leave the server.
 */

export type InstagramAuthMode = 'instagram_login' | 'unavailable'

export type InstagramPublicConfig =
  | {
      ok: true
      configured: true
      auth_mode: 'instagram_login'
      apiVersion: string
      host: 'graph.instagram.com'
      pageIdConfigured: boolean
      igAccountIdConfigured: boolean
      livePublishingEnabled: boolean
      note: string
    }
  | {
      ok: false
      configured: false
      auth_mode: 'unavailable'
      missing: string[]
      apiVersion: string
      host: 'graph.instagram.com'
      pageIdConfigured: boolean
      igAccountIdConfigured: boolean
      livePublishingEnabled: boolean
      note: string
    }

export type InstagramResolvedCredentials = {
  /** Instagram Login user access token only */
  accessToken: string
  apiVersion: string
  host: 'graph.instagram.com'
  authMode: 'instagram_login'
  /** Optional Facebook Page id (Ads/creative context only; not required for IG Login reads) */
  pageId: string | null
  /** Instagram professional account id (IG User id) */
  igUserId: string | null
  livePublishingEnabled: boolean
}

function apiVersion(): string {
  return (
    process.env.INSTAGRAM_API_VERSION?.trim() ||
    process.env.META_ADS_API_VERSION?.trim() ||
    process.env.META_CONVERSIONS_API_VERSION?.trim() ||
    'v22.0'
  )
}

export function liveInstagramPublishingEnabled(): boolean {
  return process.env.LIVE_INSTAGRAM_PUBLISHING_ENABLED === 'true'
}

/**
 * Instagram Login access token only.
 * Does not fall back to META_ADS_ACCESS_TOKEN — Ads and Instagram Login are separate.
 */
export function readInstagramAccessToken(): string {
  return process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || ''
}

export function readInstagramBusinessAccountId(): string {
  return (
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim() ||
    ''
  )
}

export function readMetaPageId(): string {
  return process.env.META_ADS_PAGE_ID?.trim() || ''
}

/** Public status — never includes secrets. */
export function getInstagramCredentials(): InstagramPublicConfig {
  const token = readInstagramAccessToken()
  const pageId = readMetaPageId()
  const igId = readInstagramBusinessAccountId()
  const live = liveInstagramPublishingEnabled()
  const missing: string[] = []
  if (!token) missing.push('INSTAGRAM_ACCESS_TOKEN')
  if (!igId) missing.push('INSTAGRAM_BUSINESS_ACCOUNT_ID')

  if (missing.length) {
    return {
      ok: false,
      configured: false,
      auth_mode: 'unavailable',
      missing,
      apiVersion: apiVersion(),
      host: 'graph.instagram.com',
      pageIdConfigured: Boolean(pageId),
      igAccountIdConfigured: Boolean(igId),
      livePublishingEnabled: live,
      note: 'Instagram Login reads need INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID. META_ADS_ACCESS_TOKEN is for Ads only.',
    }
  }

  return {
    ok: true,
    configured: true,
    auth_mode: 'instagram_login',
    apiVersion: apiVersion(),
    host: 'graph.instagram.com',
    pageIdConfigured: Boolean(pageId),
    igAccountIdConfigured: Boolean(igId),
    livePublishingEnabled: live,
    note: live
      ? 'Instagram Login configured. Live publishing is enabled after human approval.'
      : 'Instagram Login configured (graph.instagram.com). Publishing stays gated until LIVE_INSTAGRAM_PUBLISHING_ENABLED=true.',
  }
}

export function isInstagramConfigured(): boolean {
  return getInstagramCredentials().ok
}

/** Internal credential bundle for the provider. Never log or return to clients. */
export function resolveInstagramCredentials():
  | { ok: true; credentials: InstagramResolvedCredentials }
  | { ok: false; missing: string[] } {
  const accessToken = readInstagramAccessToken()
  const pageId = readMetaPageId() || null
  const igUserId = readInstagramBusinessAccountId() || null
  const missing: string[] = []
  if (!accessToken) missing.push('INSTAGRAM_ACCESS_TOKEN')
  if (!igUserId) missing.push('INSTAGRAM_BUSINESS_ACCOUNT_ID')
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    credentials: {
      accessToken,
      apiVersion: apiVersion(),
      host: 'graph.instagram.com',
      authMode: 'instagram_login',
      pageId,
      igUserId,
      livePublishingEnabled: liveInstagramPublishingEnabled(),
    },
  }
}
