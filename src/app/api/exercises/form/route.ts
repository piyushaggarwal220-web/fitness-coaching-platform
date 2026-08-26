import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import {
  claimFreeExerciseForm,
  exerciseFormUnlockKey,
  FREE_EXERCISE_FORM_LIFETIME_CAP,
} from '@/lib/exercise-form/free-unlocks'
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

function accessMeta(input: {
  locked: boolean
  entitled: boolean
  freeUnlock?: boolean
  used?: number
  remaining?: number
}) {
  return {
    locked: input.locked,
    entitled: input.entitled,
    freeUnlock: input.freeUnlock === true,
    freeUsed: input.used ?? 0,
    freeRemaining: input.remaining ?? (input.entitled ? FREE_EXERCISE_FORM_LIFETIME_CAP : 0),
    freeCap: FREE_EXERCISE_FORM_LIFETIME_CAP,
    pricePaise: EXERCISE_LIBRARY_ADDON_PAISE,
  }
}

function lockedPayload(used: number) {
  return {
    success: true,
    ...accessMeta({
      locked: true,
      entitled: false,
      used,
      remaining: 0,
    }),
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
    const result = await lookupExerciseForm(name)
    const publicPayload = publicFormPayload(result, profile.gender)

    if (!result.configured || result.skipped || !result.found || !publicPayload.hasVideo) {
      return NextResponse.json({
        success: true,
        ...accessMeta({
          locked: false,
          entitled: profile.entitled,
          remaining: FREE_EXERCISE_FORM_LIFETIME_CAP,
        }),
        ...publicPayload,
      })
    }

    if (profile.entitled) {
      return NextResponse.json({
        success: true,
        ...accessMeta({ locked: false, entitled: true, remaining: FREE_EXERCISE_FORM_LIFETIME_CAP }),
        ...publicPayload,
      })
    }

    const key = exerciseFormUnlockKey(result)
    if (!key) {
      return NextResponse.json({
        success: true,
        ...accessMeta({ locked: false, entitled: false, remaining: FREE_EXERCISE_FORM_LIFETIME_CAP }),
        ...publicPayload,
      })
    }

    const access = await claimFreeExerciseForm(auth.user.id, key)
    if (!access.allowed) {
      return NextResponse.json(lockedPayload(access.used))
    }

    return NextResponse.json({
      success: true,
      ...accessMeta({
        locked: false,
        entitled: access.entitled,
        freeUnlock: !access.entitled,
        used: access.used,
        remaining: access.remaining,
      }),
      ...publicPayload,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
