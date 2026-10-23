import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import { loadExerciseVideoAccess } from '@/lib/exercise-form/access-server'
import { publicExerciseVideoAccess } from '@/lib/exercise-form/access'
import { lookupExerciseForm, publicFormPayload } from '@/lib/exercise-form/lookup'
import type { FormDemoGender } from '@/lib/exercise-form/musclewiki'

export const dynamic = 'force-dynamic'

async function loadFormProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('gender, exercise_library_entitled')
    .eq('id', userId)
    .maybeSingle()
  return {
    gender: (String(data?.gender ?? '').toLowerCase() === 'female' ? 'female' : 'male') as FormDemoGender,
    entitled: profileEntitledForExerciseLibrary(data),
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const name = new URL(request.url).searchParams.get('name')?.trim() ?? ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const profile = await loadFormProfile(auth.supabase, auth.user.id)
    const access = await loadExerciseVideoAccess({
      userId: auth.user.id,
      lifetimeLibrary: profile.entitled,
    })
    const result = await lookupExerciseForm(name)
    const publicPayload = publicFormPayload(result, profile.gender)
    const accessMeta = publicExerciseVideoAccess(access)

    if (!access.allowed) {
      return NextResponse.json({
        success: true,
        ...accessMeta,
        ...publicPayload,
        videos: [],
        hasVideo: false,
      })
    }

    return NextResponse.json({
      success: true,
      ...accessMeta,
      ...publicPayload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
