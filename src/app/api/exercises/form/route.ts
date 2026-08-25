import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireApiUser } from '@/lib/api-auth'
import { lookupExerciseForm, publicFormPayload } from '@/lib/exercise-form/lookup'
import type { FormDemoGender } from '@/lib/exercise-form/musclewiki'

export const dynamic = 'force-dynamic'

async function preferredDemoGender(supabase: SupabaseClient, userId: string): Promise<FormDemoGender> {
  const { data } = await supabase.from('profiles').select('gender').eq('id', userId).maybeSingle()
  return String(data?.gender ?? '').toLowerCase() === 'female' ? 'female' : 'male'
}

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const name = new URL(request.url).searchParams.get('name')?.trim() ?? ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const [result, gender] = await Promise.all([
      lookupExerciseForm(name),
      preferredDemoGender(auth.supabase, auth.user.id),
    ])
    return NextResponse.json({
      success: true,
      ...publicFormPayload(result, gender),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
