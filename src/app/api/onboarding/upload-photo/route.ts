import { NextResponse } from 'next/server'
import { ONBOARDING_PHOTO_BUCKET } from '@/lib/onboarding'
import {
  MAX_STANDARD_PHOTO_UPLOAD_BYTES,
  MAX_STANDARD_PHOTO_UPLOAD_LABEL,
} from '@/lib/photo-upload'
import { isVisionSafeMediaType, validatePhotoFile } from '@/lib/photo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Large phone photos over slow networks. */
export const maxDuration = 60

const LABEL_RE = /^(front|side|back)$/i

/**
 * Same-origin onboarding photo upload fallback.
 * Used when the browser cannot reach Supabase Storage directly ("Failed to fetch").
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Please sign in again, then retry the photo upload.' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid upload payload.' }, { status: 400 })
  }

  const file = form.get('file')
  const labelRaw = form.get('label')
  const label = typeof labelRaw === 'string' ? labelRaw.trim().toLowerCase() : ''

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Photo file is required.' }, { status: 400 })
  }
  if (!LABEL_RE.test(label)) {
    return NextResponse.json({ error: 'Invalid photo label.' }, { status: 400 })
  }

  const validationError = validatePhotoFile(file)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }
  if (!isVisionSafeMediaType(file.type) && file.type) {
    return NextResponse.json(
      { error: 'Use a JPEG or PNG photo. Convert HEIC photos first.' },
      { status: 400 }
    )
  }
  if (file.size > MAX_STANDARD_PHOTO_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `Photo is too large (max ${MAX_STANDARD_PHOTO_UPLOAD_LABEL}). Use “Take photo now” or a smaller image.`,
      },
      { status: 413 }
    )
  }

  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    (file.type === 'image/png' ? 'png' : 'jpg')
  const path = `${user.id}/${Date.now()}_${label}.${ext}`

  try {
    const admin = createAdminClient()
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error } = await admin.storage.from(ONBOARDING_PHOTO_BUCKET).upload(path, bytes, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })
    if (error) {
      return NextResponse.json(
        { error: `Photo upload failed (${label}): ${error.message}` },
        { status: 422 }
      )
    }
    return NextResponse.json({ success: true, path })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Photo upload failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
