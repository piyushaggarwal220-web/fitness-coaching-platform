/**
 * Shopify Admin API provider for Jarvis.
 * Auth is client-credentials only. Secrets and access tokens never leave the server.
 * Writes still go through the Jarvis permission engine; this module does not enable new write scopes.
 */

import { redactSecrets } from '@/lib/jarvis/operator-errors'
import { interpretShopifyGraphqlResponse } from '@/lib/jarvis/diagnostics/graphql'
import { metricProvenance } from '@/lib/jarvis/diagnostics/provenance'
import type { DataStatus, GraphqlInspectResult, MetricProvenance } from '@/lib/jarvis/diagnostics/diagnostic-types'

const DEFAULT_API_VERSION = '2026-07'
const DEFAULT_EXPIRES_IN_SEC = 86399
const REFRESH_SKEW_MS = 60_000

export type ShopifyPublicConfig =
  | {
      ok: true
      shop: string
      shopDomain: string
      apiVersion: string
    }
  | { ok: false; missing: string[] }

type ShopifyEnv =
  | {
      ok: true
      shop: string
      shopDomain: string
      apiVersion: string
      clientId: string
      clientSecret: string
    }
  | { ok: false; missing: string[] }

type TokenCache = {
  token: string
  expiresAt: number
  scope: string
}

let tokenCache: TokenCache | null = null
let inflight: Promise<TokenCache> | null = null

function normalizeShopSubdomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.myshopify\.com$/i, '')
}

function readShopifyEnv(): ShopifyEnv {
  const shop = normalizeShopSubdomain(process.env.SHOPIFY_SHOP ?? '')
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || ''
  const apiVersion = process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_API_VERSION
  const missing: string[] = []
  if (!shop) missing.push('SHOPIFY_SHOP')
  if (!clientId) missing.push('SHOPIFY_CLIENT_ID')
  if (!clientSecret) missing.push('SHOPIFY_CLIENT_SECRET')
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    shop,
    shopDomain: `${shop}.myshopify.com`,
    apiVersion,
    clientId,
    clientSecret,
  }
}

export function redactShopifySecrets(text: string): string {
  return redactSecrets(text).replace(/shp(at|ca|ua|pa)_[a-zA-Z0-9]+/gi, '[redacted]')
}

export function getShopifyCredentials(): ShopifyPublicConfig {
  const env = readShopifyEnv()
  if (!env.ok) return env
  return {
    ok: true,
    shop: env.shop,
    shopDomain: env.shopDomain,
    apiVersion: env.apiVersion,
  }
}

export function isShopifyConfigured(): boolean {
  return readShopifyEnv().ok
}

export function resetShopifyAuthCache(): void {
  tokenCache = null
  inflight = null
}

async function requestClientCredentialsToken(): Promise<TokenCache> {
  const env = readShopifyEnv()
  if (!env.ok) {
    throw new Error(`Shopify not configured: ${env.missing.join(', ')}`)
  }

  const res = await fetch(`https://${env.shop}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.clientId,
      client_secret: env.clientSecret,
    }),
  })

  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
    errors?: string
  }

  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || json.errors || `HTTP ${res.status}`
    throw new Error(`Shopify client credentials failed: ${redactShopifySecrets(String(detail))}`)
  }

  const expiresIn =
    typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : DEFAULT_EXPIRES_IN_SEC

  return {
    token: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof json.scope === 'string' ? json.scope : '',
  }
}

async function getCachedAccessToken(): Promise<TokenCache> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - REFRESH_SKEW_MS) {
    return tokenCache
  }
  if (!inflight) {
    inflight = requestClientCredentialsToken()
      .then((next) => {
        tokenCache = next
        return next
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

async function shopifyAdminRequest(
  path: string,
  init?: { method?: string; body?: unknown },
  retried = false
): Promise<{ http_status: number; json: unknown; request_id: string | null }> {
  const env = readShopifyEnv()
  if (!env.ok) {
    throw new Error(`Shopify not configured: ${env.missing.join(', ')}`)
  }
  const cached = await getCachedAccessToken()
  const url = `https://${env.shopDomain}/admin/api/${env.apiVersion}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: init?.method || 'GET',
    headers: {
      'X-Shopify-Access-Token': cached.token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  const request_id = res.headers.get('x-request-id')
  if (res.status === 401 && !retried) {
    resetShopifyAuthCache()
    return shopifyAdminRequest(path, init, true)
  }
  return { http_status: res.status, json, request_id }
}

async function shopifyFetch<T>(
  path: string,
  init?: { method?: string; body?: Record<string, unknown> },
  retried = false
): Promise<T> {
  const result = await shopifyAdminRequest(path, init, retried)
  if (result.http_status < 200 || result.http_status >= 300) {
    const raw =
      (result.json as { errors?: string })?.errors ||
      JSON.stringify(result.json).slice(0, 200) ||
      `HTTP ${result.http_status}`
    throw new Error(`Shopify API ${result.http_status}: ${redactShopifySecrets(String(raw))}`)
  }
  return result.json as T
}

export async function shopifyGraphql<T = unknown>(query: string, variables?: Record<string, unknown>) {
  const result = await shopifyAdminRequest('/graphql.json', {
    method: 'POST',
    body: variables ? { query, variables } : { query },
  })
  const inspected: GraphqlInspectResult = interpretShopifyGraphqlResponse({
    httpStatus: result.http_status,
    json: result.json,
    requestId: result.request_id,
  })
  return {
    ...inspected,
    data: (inspected.data ?? null) as T | null,
  }
}

/** Window currently used by shopifyTodayCommerce. Intentionally UTC until an approved timezone fix. */
export function shopifyTodayQueryWindow(now = new Date()): {
  start: string
  end: string
  timezone: string
  calculation_method: string
} {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(now)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timezone: 'UTC',
    calculation_method:
      'sum(order.total_price) of last 50 REST /orders.json since 00:00 UTC today (status=any)',
  }
}

export async function shopifyTestConnection(): Promise<{
  ok: boolean
  status: 'connected' | 'not_connected' | 'error'
  message: string
  shop?: string
  api_version?: string
  granted_scopes?: string | null
  product_sample_count?: number
}> {
  const config = getShopifyCredentials()
  if (!config.ok) {
    return {
      ok: false,
      status: 'not_connected',
      message: `Shopify is not connected. Set ${config.missing.join(', ')} on the server.`,
    }
  }
  try {
    const cached = await getCachedAccessToken()
    const data = await shopifyFetch<{ products?: unknown[] }>('/products.json?limit=1')
    return {
      ok: true,
      status: 'connected',
      message: `Shopify Admin API reachable for ${config.shopDomain}.`,
      shop: config.shopDomain,
      api_version: config.apiVersion,
      granted_scopes: cached.scope || null,
      product_sample_count: Array.isArray(data.products) ? data.products.length : 0,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      message: redactShopifySecrets(err instanceof Error ? err.message : 'Shopify Admin API test failed'),
    }
  }
}

export async function shopifyGetProducts(limit = 25) {
  const data = await shopifyFetch<{
    products: {
      id: number
      title: string
      status: string
      handle: string
      variants: { id: number; price: string; inventory_quantity?: number }[]
    }[]
  }>(`/products.json?limit=${Math.min(limit, 50)}`)
  return (data.products ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    handle: p.handle,
    price: p.variants?.[0]?.price ?? null,
    inventory: p.variants?.[0]?.inventory_quantity ?? null,
  }))
}

export async function shopifyGetProduct(productId: string | number) {
  const data = await shopifyFetch<{ product: Record<string, unknown> }>(
    `/products/${productId}.json`
  )
  return data.product
}

export async function shopifyGetOrders(opts?: {
  limit?: number
  status?: string
  createdAtMin?: string
}) {
  const limit = Math.min(opts?.limit ?? 25, 50)
  const status = opts?.status || 'any'
  const params = new URLSearchParams({
    limit: String(limit),
    status,
    fields: 'id,name,total_price,currency,financial_status,created_at,line_items,refunds',
  })
  if (opts?.createdAtMin) params.set('created_at_min', opts.createdAtMin)
  const data = await shopifyFetch<{
    orders?: {
      id: number
      name: string
      total_price: string
      currency?: string
      financial_status: string
      created_at: string
      line_items?: { title: string; quantity: number; price?: string }[]
      refunds?: { id: number; transactions?: { amount?: string }[] }[]
    }[] | null
  }>(`/orders.json?${params.toString()}`)
  if (!Array.isArray(data.orders)) {
    throw new Error('Shopify orders payload missing orders array (refusing to treat as zero).')
  }
  return data.orders.map((o) => ({
    id: o.id,
    name: o.name,
    total_price: o.total_price,
    currency: o.currency ?? null,
    financial_status: o.financial_status,
    created_at: o.created_at,
    items: o.line_items?.map((li) => `${li.quantity}x ${li.title}`) ?? [],
    line_items: o.line_items ?? [],
    refunds_amount: (o.refunds ?? []).reduce((sum, r) => {
      const txs = r.transactions ?? []
      return sum + txs.reduce((s, t) => s + (Number(t.amount) || 0), 0)
    }, 0),
  }))
}

export type ShopifyTodayCommerce =
  | {
      connected: true
      ok: true
      source: 'shopify'
      as_of: string
      revenue: number
      orders: number
      aov: number | null
      refunds_count: number
      refunds_amount: number
      currency: string
      products: { title: string; quantity: number }[]
      note: string
      data_status: 'verified'
      provenance: MetricProvenance
    }
  | {
      connected: false
      ok: false
      source: 'shopify'
      as_of: string
      revenue: null
      orders: null
      aov: null
      refunds_count: null
      refunds_amount: null
      unavailable_reason: string
      data_status: 'unavailable'
      provenance: MetricProvenance
    }
  | {
      connected: true
      ok: false
      source: 'shopify'
      as_of: string
      revenue: null
      orders: null
      aov: null
      refunds_count: null
      refunds_amount: null
      error: string
      error_type: 'API_ERROR'
      data_status: 'failed'
      provenance: MetricProvenance
    }

function failedRevenueProvenance(status: DataStatus, asOf: string, note: string): MetricProvenance {
  return metricProvenance({
    metric: 'shopify_revenue',
    value: null,
    currency: 'INR',
    timezone: 'UTC',
    source: 'shopify.orders',
    tool_name: 'shopify.today_revenue',
    data_status: status,
    confidence: 'low',
    calculation_method: 'none — source did not return a numeric total',
    note,
    source_timestamp: asOf,
  })
}

/** Today's Shopify commerce. Never infers revenue from Meta ads. Never converts API failure into 0. */
export async function shopifyTodayCommerce(): Promise<ShopifyTodayCommerce> {
  const asOf = new Date().toISOString()
  const window = shopifyTodayQueryWindow(new Date(asOf))
  if (!isShopifyConfigured()) {
    return {
      connected: false,
      ok: false,
      source: 'shopify',
      as_of: asOf,
      revenue: null,
      orders: null,
      aov: null,
      refunds_count: null,
      refunds_amount: null,
      unavailable_reason:
        'Revenue cannot be determined yet because Shopify is not connected. Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET on the server.',
      data_status: 'unavailable',
      provenance: failedRevenueProvenance(
        'unavailable',
        asOf,
        'Shopify is not configured. Missing data is not ₹0.'
      ),
    }
  }
  try {
    const orders = await shopifyGetOrders({
      limit: 50,
      status: 'any',
      createdAtMin: window.start,
    })
    const revenue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    const refundsAmount = orders.reduce((s, o) => s + (o.refunds_amount || 0), 0)
    const refundsCount = orders.filter(
      (o) =>
        o.refunds_amount > 0 ||
        o.financial_status === 'refunded' ||
        o.financial_status === 'partially_refunded'
    ).length
    const productMap = new Map<string, number>()
    for (const o of orders) {
      for (const li of o.line_items) {
        productMap.set(li.title, (productMap.get(li.title) || 0) + (li.quantity || 0))
      }
    }
    const provenance = metricProvenance({
      metric: 'shopify_revenue',
      value: revenue,
      currency: orders[0]?.currency || 'INR',
      period: { start: window.start, end: window.end, label: 'utc_today' },
      timezone: window.timezone,
      source: 'shopify.orders',
      tool_name: 'shopify.today_revenue',
      data_status: 'verified',
      confidence: orders.length >= 50 ? 'medium' : 'high',
      calculation_method: window.calculation_method,
      sample_limit: 50,
      note: 'Verified Admin API payload. Empty array is explicit zero, not a hidden failure.',
      source_timestamp: asOf,
    })
    return {
      connected: true,
      ok: true,
      source: 'shopify',
      as_of: asOf,
      revenue,
      orders: orders.length,
      aov: orders.length ? revenue / orders.length : null,
      refunds_count: refundsCount,
      refunds_amount: refundsAmount,
      currency: orders[0]?.currency || 'INR',
      products: [...productMap.entries()].map(([title, quantity]) => ({ title, quantity })),
      note: 'Shopify Admin API — last 50 orders created since 00:00 UTC today. Not a full warehouse export. This is store revenue, not Meta ad-attributed revenue.',
      data_status: 'verified',
      provenance,
    }
  } catch (err) {
    const error = redactShopifySecrets(err instanceof Error ? err.message : 'Shopify read failed')
    return {
      connected: true,
      ok: false,
      source: 'shopify',
      as_of: asOf,
      revenue: null,
      orders: null,
      aov: null,
      refunds_count: null,
      refunds_amount: null,
      error,
      error_type: 'API_ERROR',
      data_status: 'failed',
      provenance: failedRevenueProvenance('failed', asOf, error),
    }
  }
}

export async function shopifyOrderStats(days = 7): Promise<{
  days: number
  order_count: number | null
  revenue: number | null
  sample: unknown[]
  note: string
  ok: boolean
  data_status: DataStatus
  error?: string
  error_type?: 'API_ERROR'
  provenance: MetricProvenance
}> {
  const asOf = new Date().toISOString()
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  try {
    const orders = await shopifyGetOrders({ limit: 50, status: 'any' })
    const recent = orders.filter((o) => new Date(o.created_at).getTime() >= since)
    const revenue = recent.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    return {
      days,
      order_count: recent.length,
      revenue,
      sample: recent.slice(0, 10),
      note: 'Limited to last 50 orders from Admin API — rolling hours from now, not a shop-timezone calendar window.',
      ok: true,
      data_status: 'verified',
      provenance: metricProvenance({
        metric: 'shopify_revenue',
        value: revenue,
        currency: recent[0]?.currency || 'INR',
        period: { start: new Date(since).toISOString(), end: asOf, label: `rolling_${days}d` },
        timezone: 'UTC',
        source: 'shopify.orders',
        tool_name: 'shopify.order_stats',
        data_status: 'verified',
        confidence: 'medium',
        calculation_method: `client filter of last 50 REST orders where created_at >= now-${days}d`,
        sample_limit: 50,
        source_timestamp: asOf,
      }),
    }
  } catch (err) {
    const error = redactShopifySecrets(err instanceof Error ? err.message : 'Shopify stats failed')
    return {
      days,
      order_count: null,
      revenue: null,
      sample: [],
      note: 'Shopify stats failed. This is not ₹0.',
      ok: false,
      data_status: 'failed',
      error,
      error_type: 'API_ERROR',
      provenance: metricProvenance({
        metric: 'shopify_revenue',
        value: null,
        currency: 'INR',
        timezone: 'UTC',
        source: 'shopify.orders',
        tool_name: 'shopify.order_stats',
        data_status: 'failed',
        confidence: 'low',
        calculation_method: 'none — API error',
        note: error,
        source_timestamp: asOf,
      }),
    }
  }
}

/** LOW_RISK writes — still gated by Jarvis permissions. Not enabled by this auth change. */
export async function shopifyUpdateProductDescription(productId: string | number, bodyHtml: string) {
  return shopifyFetch(`/products/${productId}.json`, {
    method: 'PUT',
    body: { product: { id: Number(productId), body_html: bodyHtml } },
  })
}

export async function shopifyUpdateProductSeo(
  productId: string | number,
  seo: { title?: string; description?: string }
) {
  return shopifyFetch(`/products/${productId}.json`, {
    method: 'PUT',
    body: {
      product: {
        id: Number(productId),
        metafields_global_title_tag: seo.title,
        metafields_global_description_tag: seo.description,
      },
    },
  })
}

/** SIGNIFICANT writes — still gated by Jarvis permissions. Not enabled by this auth change. */
export async function shopifyUpdateProductPrice(
  productId: string | number,
  variantId: string | number,
  price: string
) {
  return shopifyFetch(`/variants/${variantId}.json`, {
    method: 'PUT',
    body: { variant: { id: Number(variantId), price } },
  })
}

export async function shopifyUpdateProductStatus(
  productId: string | number,
  status: 'active' | 'draft' | 'archived'
) {
  return shopifyFetch(`/products/${productId}.json`, {
    method: 'PUT',
    body: { product: { id: Number(productId), status } },
  })
}

export async function shopifyUpdateProductImage(
  productId: string | number,
  imageSrc: string
) {
  return shopifyFetch(`/products/${productId}/images.json`, {
    method: 'POST',
    body: { image: { src: imageSrc } },
  })
}

/** Explicitly blocked operations */
export function shopifyBlockedOperation(name: string): never {
  throw new Error(
    `Blocked Shopify operation "${name}" — payment/billing/credentials changes are not allowed through Jarvis.`
  )
}
