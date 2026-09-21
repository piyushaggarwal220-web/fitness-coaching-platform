/** Human-readable Jarvis errors for the operator UI. Never leak secrets or stacks. */

const SECRET_PATTERN =
  /(sk-[a-zA-Z0-9_-]+|Bearer\s+\S+|api[_-]?key[=:]\s*\S+|access[_-]?token[=:]\s*\S+|xox[baprs]-\S+|shp(at|ca|ua|pa)_[a-zA-Z0-9]+)/gi

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, '[redacted]')
}

export function humanizeJarvisError(raw: unknown): string {
  const message = redactSecrets(
    raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Something went wrong.'
  )
  const firstLine = message.split('\n')[0]?.trim() || 'Something went wrong.'
  const lower = firstLine.toLowerCase()

  if (
    lower.includes('brave') ||
    (lower.includes('web search') && lower.includes('not configured')) ||
    lower.includes('brave_search_api_key')
  ) {
    return 'Research unavailable because BRAVE_SEARCH_API_KEY is not configured.'
  }
  if (
    (lower.includes('meta') &&
      (lower.includes('not configured') ||
        lower.includes('connection') ||
        lower.includes('unauthorized') ||
        lower.includes('oauth'))) ||
    lower.includes('meta_ads_access_token')
  ) {
    return 'Meta connection failed. Jarvis could not retrieve campaign data.'
  }
  if (lower.includes('video') && (lower.includes('not configured') || lower.includes('webhook'))) {
    return 'Video provider is not configured.'
  }
  if (
    lower.includes('budget exhausted') ||
    lower.includes('daily ai budget') ||
    lower.includes('paused_budget')
  ) {
    return 'Jarvis paused this task because the daily AI budget was exhausted.'
  }
  if (lower.includes('shopify') && lower.includes('not configured')) {
    return 'Shopify is not configured. Jarvis could not retrieve store data.'
  }
  if (lower.includes('instagram') && lower.includes('not configured')) {
    return 'Instagram publishing is not configured.'
  }
  if (firstLine.includes('    at ') || /\.tsx?:\d+:\d+/.test(firstLine)) {
    return 'Jarvis hit an unexpected error while working on this request.'
  }
  return firstLine.slice(0, 280)
}

export function sanitizePublicJson(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') return redactSecrets(value).slice(0, 500)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 12).map(sanitizePublicJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase()
      if (
        key.includes('token') ||
        key.includes('secret') ||
        key.includes('password') ||
        key.includes('api_key') ||
        key.includes('apikey')
      ) {
        continue
      }
      out[k] = sanitizePublicJson(v)
    }
    return out
  }
  return undefined
}
