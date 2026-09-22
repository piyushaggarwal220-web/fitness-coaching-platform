/**
 * Safe video source handling for Jarvis.
 * Opaque source_ref only — never expose filesystem paths or public storage URLs.
 */

import { createHash, randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const JARVIS_VIDEO_BUCKET = 'jarvis-video-sources'
export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024 // 200 MB
export const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])
export const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.mov', '.webm'])

const SOURCE_REF_PREFIX = 'jarvis-video://'

export type ValidatedVideoSource = {
  ok: true
  mime_type: string
  byte_size: number
  original_filename: string
  ext: string
}

export type VideoSourceValidationError = {
  ok: false
  error: string
  code:
    | 'unsupported_mime'
    | 'unsupported_extension'
    | 'file_too_large'
    | 'empty_file'
    | 'invalid_filename'
    | 'path_traversal'
}

function sanitizeFilename(name: string): string | null {
  const base = name.replace(/\\/g, '/').split('/').pop() || ''
  if (!base || base === '.' || base === '..') return null
  if (base.includes('..') || /[\0\r\n]/.test(base)) return null
  return base.slice(0, 180)
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  if (i < 0) return ''
  return filename.slice(i).toLowerCase()
}

export function validateVideoUpload(input: {
  filename: string
  mimeType: string
  byteSize: number
}): ValidatedVideoSource | VideoSourceValidationError {
  if (
    input.filename.includes('..') ||
    input.filename.includes('\0') ||
    /[\r\n]/.test(input.filename)
  ) {
    return { ok: false, error: 'Path traversal rejected.', code: 'path_traversal' }
  }
  const original = sanitizeFilename(input.filename)
  if (!original) {
    return { ok: false, error: 'Invalid filename.', code: 'invalid_filename' }
  }
  if (original.includes('/') || original.includes('\\')) {
    return { ok: false, error: 'Path traversal rejected.', code: 'path_traversal' }
  }
  if (!input.byteSize || input.byteSize <= 0) {
    return { ok: false, error: 'Empty file rejected.', code: 'empty_file' }
  }
  if (input.byteSize > MAX_VIDEO_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File exceeds ${MAX_VIDEO_UPLOAD_BYTES} bytes.`,
      code: 'file_too_large',
    }
  }
  const mime = (input.mimeType || '').toLowerCase().split(';')[0]!.trim()
  if (!ALLOWED_VIDEO_MIME.has(mime)) {
    return {
      ok: false,
      error: `Unsupported MIME type: ${mime || '(missing)'}. Allowed: MP4, MOV, WebM.`,
      code: 'unsupported_mime',
    }
  }
  const ext = extensionOf(original)
  if (!ALLOWED_VIDEO_EXT.has(ext)) {
    return {
      ok: false,
      error: `Unsupported extension: ${ext || '(none)'}. Allowed: .mp4, .mov, .webm.`,
      code: 'unsupported_extension',
    }
  }
  return {
    ok: true,
    mime_type: mime,
    byte_size: input.byteSize,
    original_filename: original,
    ext,
  }
}

/** Reject arbitrary remote URLs unless allowlisted (disabled by default). */
export function validateSourceReferenceOrUrl(input: string): {
  ok: boolean
  kind: 'source_ref' | 'job_id' | 'rejected'
  value: string
  error?: string
} {
  const v = input.trim()
  if (!v) return { ok: false, kind: 'rejected', value: v, error: 'Empty source.' }
  if (v.startsWith(SOURCE_REF_PREFIX)) {
    const id = v.slice(SOURCE_REF_PREFIX.length)
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return { ok: false, kind: 'rejected', value: v, error: 'Malformed source_ref.' }
    }
    return { ok: true, kind: 'source_ref', value: v }
  }
  // UUID job id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return { ok: true, kind: 'job_id', value: v }
  }
  // Block filesystem paths and SSRF-prone URLs
  if (/^[a-zA-Z]:\\/.test(v) || v.startsWith('/') || v.startsWith('\\\\') || v.includes('..')) {
    return {
      ok: false,
      kind: 'rejected',
      value: v,
      error: 'Filesystem paths are not accepted. Upload via Jarvis source_ref.',
    }
  }
  if (/^https?:\/\//i.test(v)) {
    return {
      ok: false,
      kind: 'rejected',
      value: v,
      error: 'Arbitrary remote URLs are not accepted (SSRF protection). Upload a source first.',
    }
  }
  return {
    ok: false,
    kind: 'rejected',
    value: v,
    error: 'Unrecognized source. Use jarvis-video:// UUID from upload.',
  }
}

export function makeSourceRef(id: string): string {
  return `${SOURCE_REF_PREFIX}${id}`
}

export function parseSourceRef(ref: string): string | null {
  if (!ref.startsWith(SOURCE_REF_PREFIX)) return null
  const id = ref.slice(SOURCE_REF_PREFIX.length)
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export async function storeVideoSource(input: {
  bytes: Buffer
  filename: string
  mimeType: string
  actorId?: string | null
  durationSec?: number | null
  width?: number | null
  height?: number | null
}): Promise<{
  ok: boolean
  source_ref?: string
  id?: string
  error?: string
  public_url_exposed: false
}> {
  const validated = validateVideoUpload({
    filename: input.filename,
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
  })
  if (!validated.ok) {
    return { ok: false, error: validated.error, public_url_exposed: false }
  }

  const id = randomUUID()
  const source_ref = makeSourceRef(id)
  const checksum = createHash('sha256').update(input.bytes).digest('hex')
  const storage_path = `${id}/source${validated.ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from(JARVIS_VIDEO_BUCKET)
    .upload(storage_path, input.bytes, {
      contentType: validated.mime_type,
      upsert: false,
    })

  if (uploadError) {
    return {
      ok: false,
      error: `Storage upload failed: ${uploadError.message}`,
      public_url_exposed: false,
    }
  }

  const { error: rowError } = await admin.from('jarvis_video_sources').insert({
    id,
    source_ref,
    original_filename: validated.original_filename,
    mime_type: validated.mime_type,
    byte_size: validated.byte_size,
    storage_path,
    duration_sec: input.durationSec ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    checksum_sha256: checksum,
    created_by: input.actorId ?? null,
    metadata: { bucket: JARVIS_VIDEO_BUCKET },
  })

  if (rowError) {
    // Best-effort cleanup
    await admin.storage.from(JARVIS_VIDEO_BUCKET).remove([storage_path])
    return { ok: false, error: rowError.message, public_url_exposed: false }
  }

  return { ok: true, source_ref, id, public_url_exposed: false }
}

export async function resolveSourceForProvider(sourceRef: string): Promise<{
  ok: boolean
  /** Private signed URL for provider only — never return to frontend */
  private_fetch_url?: string
  storage_path?: string
  source_ref?: string
  error?: string
}> {
  const id = parseSourceRef(sourceRef)
  if (!id) {
    return { ok: false, error: 'Invalid source_ref' }
  }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('jarvis_video_sources')
    .select('source_ref, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    return { ok: false, error: error?.message || 'Source not found' }
  }
  const { data: signed, error: signError } = await admin.storage
    .from(JARVIS_VIDEO_BUCKET)
    .createSignedUrl(data.storage_path, 60 * 30)
  if (signError || !signed?.signedUrl) {
    return { ok: false, error: signError?.message || 'Failed to sign source URL' }
  }
  return {
    ok: true,
    private_fetch_url: signed.signedUrl,
    storage_path: data.storage_path,
    source_ref: data.source_ref,
  }
}

export async function listVideoSources(limit = 20) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('jarvis_video_sources')
    .select(
      'id, source_ref, original_filename, mime_type, byte_size, duration_sec, width, height, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 50))
  return (data ?? []).map((row) => ({
    ...row,
    // Never include storage_path or signed URLs
  }))
}
