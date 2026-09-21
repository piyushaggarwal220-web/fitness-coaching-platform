const META_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
  )
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

function writeMetaCookie(name: string, value: string) {
  if (typeof document === 'undefined' || !value) return
  const expires = new Date(Date.now() + META_COOKIE_MAX_AGE_SEC * 1000).toUTCString()
  const encoded = encodeURIComponent(value)
  document.cookie = `${name}=${encoded}; expires=${expires}; path=/; SameSite=Lax`
  document.cookie = `${name}=${encoded}; expires=${expires}; path=/; domain=.lurvox.in; SameSite=Lax`
}

/** Read Meta browser cookies for CAPI dedup / match (checkout → verify). */
export function readMetaBrowserIds(): { fbp?: string; fbc?: string } {
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
  }
}

/**
 * Copy fbclid / _fbp / _fbc from the URL onto this host.
 * Orange ads land on www.lurvox.in then jump to app.lurvox.in — without this,
 * Purchase CAPI has no click id and Meta drops the sale as a signal.
 */
export function persistMetaClickIdsFromLocation() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const fbclid = params.get('fbclid')?.trim()
  const fbp = params.get('fbp')?.trim()
  const fbc = params.get('fbc')?.trim()

  if (fbp?.startsWith('fb.')) writeMetaCookie('_fbp', fbp)
  if (fbc?.startsWith('fb.')) writeMetaCookie('_fbc', fbc)
  else if (fbclid && !readCookie('_fbc')) {
    writeMetaCookie('_fbc', `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}`)
  }
}

/** Keep ad click ids when moving Instant landing → checkout. */
export function checkoutHrefWithAttribution(planSlug: string): string {
  const params = new URLSearchParams(
    typeof window === 'undefined' ? '' : window.location.search
  )
  params.set('plan', planSlug)
  return `/checkout?${params.toString()}`
}

export function metaBrowserIdsForRequest(): { meta_fbp?: string; meta_fbc?: string } {
  persistMetaClickIdsFromLocation()
  const ids = readMetaBrowserIds()
  return {
    ...(ids.fbp ? { meta_fbp: ids.fbp } : {}),
    ...(ids.fbc ? { meta_fbc: ids.fbc } : {}),
  }
}

const META_ID_MAX = 200

function cleanMetaId(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || !trimmed.startsWith('fb.')) return null
  return trimmed.slice(0, META_ID_MAX)
}

/** Persist click ids on the Razorpay order so webhook CAPI still matches the ad. */
export function razorpayMetaNotes(body?: {
  meta_fbp?: string | null
  meta_fbc?: string | null
}): Record<string, string> {
  const notes: Record<string, string> = {}
  const fbp = cleanMetaId(body?.meta_fbp)
  const fbc = cleanMetaId(body?.meta_fbc)
  if (fbp) notes.meta_fbp = fbp
  if (fbc) notes.meta_fbc = fbc
  return notes
}

export function metaIdsFromOrderNotes(notes?: Record<string, string | undefined> | null): {
  fbp: string | null
  fbc: string | null
} {
  return {
    fbp: cleanMetaId(notes?.meta_fbp),
    fbc: cleanMetaId(notes?.meta_fbc),
  }
}

export function metaAttributionFromRequest(
  request: Request,
  body?: { meta_fbp?: string | null; meta_fbc?: string | null },
  notes?: Record<string, string | undefined> | null
): {
  fbp: string | null
  fbc: string | null
  clientIpAddress: string | null
  clientUserAgent: string | null
} {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const fromNotes = metaIdsFromOrderNotes(notes)
  const ua = request.headers.get('user-agent')
  const looksLikeRazorpay = Boolean(ua && /razorpay|python-requests|axios/i.test(ua))
  return {
    fbp: cleanMetaId(body?.meta_fbp) || fromNotes.fbp,
    fbc: cleanMetaId(body?.meta_fbc) || fromNotes.fbc,
    clientIpAddress: looksLikeRazorpay ? null : forwarded || null,
    clientUserAgent: looksLikeRazorpay ? null : ua,
  }
}
