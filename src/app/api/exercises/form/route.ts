import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import { lookupExerciseForm, publicFormPayload } from '@/lib/exercise-form/lookup'
import type { FormDemoGender } from '@/lib/exercise-form/musclewiki'
import { EXERCISE_LIBRARY_ADDON_PAISE } from '@/lib/payments/checkout-discounts'

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

function lockedPayload() {
  return {
    success: true,
    locked: true,
    entitled: false,
    pricePaise: EXERCISE_LIBRARY_ADDON_PAISE,
    configured: true,
    skipped: false,
    found: false,
    name: null,
    steps: [],
    muscles: [],
    category: null,
    difficulty: null,
    force: null,
    mechanic: null,
    grips: [],
    videos: [],
    exerciseId: null,
    hasVideo: false,
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
    if (!profile.entitled) {
      return NextResponse.json(lockedPayload())
    }
    const result = await lookupExerciseForm(name)
    return NextResponse.json({
      success: true,
      locked: false,
      entitled: true,
      pricePaise: EXERCISE_LIBRARY_ADDON_PAISE,
      ...publicFormPayload(result, profile.gender),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
