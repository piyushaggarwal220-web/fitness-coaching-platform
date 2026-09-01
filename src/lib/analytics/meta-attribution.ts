/** Read Meta browser cookies for CAPI dedup / match (checkout → verify). */
export function readMetaBrowserIds(): { fbp?: string; fbc?: string } {
  if (typeof document === 'undefined') return {}
  const read = (name: string) => {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`)
    )
    return match?.[1] ? decodeURIComponent(match[1]) : undefined
  }
  return {
    fbp: read('_fbp'),
    fbc: read('_fbc'),
  }
}

export function metaAttributionFromRequest(
  request: Request,
  body?: { meta_fbp?: string | null; meta_fbc?: string | null }
): {
  fbp: string | null
  fbc: string | null
  clientIpAddress: string | null
  clientUserAgent: string | null
} {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return {
    fbp: body?.meta_fbp?.trim() || null,
    fbc: body?.meta_fbc?.trim() || null,
    clientIpAddress: forwarded || null,
    clientUserAgent: request.headers.get('user-agent'),
  }
}
