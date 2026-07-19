import type { SupabaseClient } from '@supabase/supabase-js'

const PUBLIC_MARKER = '/storage/v1/object/public/'
const SIGN_MARKER = '/storage/v1/object/sign/'

/** Extract object path from a stored public/signed URL or raw path. */
export function extractStorageObjectPath(
  urlOrPath: string | null | undefined,
  bucket: string
): string | null {
  if (!urlOrPath) return null
  const value = urlOrPath.trim()
  if (!value) return null

  if (!value.includes('://') && !value.startsWith('/')) {
    return value.replace(/^\/+/, '')
  }

  const publicIdx = value.indexOf(`${PUBLIC_MARKER}${bucket}/`)
  if (publicIdx >= 0) {
    const rest = value.slice(publicIdx + `${PUBLIC_MARKER}${bucket}/`.length)
    return decodeURIComponent(rest.split('?')[0] || '')
  }

  const signIdx = value.indexOf(`${SIGN_MARKER}${bucket}/`)
  if (signIdx >= 0) {
    const rest = value.slice(signIdx + `${SIGN_MARKER}${bucket}/`.length)
    return decodeURIComponent(rest.split('?')[0] || '')
  }

  return null
}

/** Create a short-lived signed URL for private storage objects. */
export async function resolveStorageUrl(
  supabase: SupabaseClient,
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  if (!urlOrPath) return null

  const path = extractStorageObjectPath(urlOrPath, bucket)
  if (!path) {
    // External / unknown URL — only allow https
    if (urlOrPath.startsWith('https://')) return urlOrPath
    return null
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/** Resolve progress photos that may live in checkin or onboarding buckets. */
export async function resolveProgressPhotoUrl(
  supabase: SupabaseClient,
  urlOrPath: string | null | undefined,
  expiresInSeconds = 60 * 60
): Promise<string | null> {
  if (!urlOrPath) return null

  for (const bucket of ['checkin-photos', 'onboarding-photos'] as const) {
    const extracted = extractStorageObjectPath(urlOrPath, bucket)
    const candidate =
      extracted ?? (!urlOrPath.includes('://') && !urlOrPath.startsWith('/') ? urlOrPath : null)
    if (!candidate) continue
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(candidate, expiresInSeconds)
    if (!error && data?.signedUrl) return data.signedUrl
  }

  if (urlOrPath.startsWith('https://')) return urlOrPath
  return null
}
