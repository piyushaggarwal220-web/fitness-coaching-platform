import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveStorageUrl } from '@/lib/storage/media-url'

const BIO_MAX = 2000

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, name, bio, display_photo_path, user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach access required' }, { status: 403 })

  const photoUrl = await resolveStorageUrl(supabase, 'avatars', coach.display_photo_path as string | null)
  return NextResponse.json({
    coach: {
      id: coach.id,
      name: coach.name,
      bio: coach.bio ?? '',
      displayPhotoPath: coach.display_photo_path,
      photoUrl,
    },
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: coach } = await supabase.from('coaches').select('id').eq('user_id', user.id).maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach access required' }, { status: 403 })

  let body: { name?: string; bio?: string; displayPhotoPath?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = body.name?.trim() ?? undefined
  const bio = body.bio != null ? String(body.bio).slice(0, BIO_MAX) : undefined
  const displayPhotoPath = body.displayPhotoPath

  const patch: Record<string, unknown> = {}
  if (name !== undefined) {
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    patch.name = name
  }
  if (bio !== undefined) patch.bio = bio.trim() || null
  if (displayPhotoPath !== undefined) patch.display_photo_path = displayPhotoPath

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coaches')
    .update(patch)
    .eq('id', coach.id)
    .select('id, name, bio, display_photo_path')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to save profile' }, { status: 500 })
  }

  const photoUrl = await resolveStorageUrl(supabase, 'avatars', data.display_photo_path as string | null)
  return NextResponse.json({
    coach: {
      id: data.id,
      name: data.name,
      bio: data.bio ?? '',
      displayPhotoPath: data.display_photo_path,
      photoUrl,
    },
  })
}
