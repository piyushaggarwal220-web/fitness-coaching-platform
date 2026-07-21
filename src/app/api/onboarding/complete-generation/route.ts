import { after, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  enqueueInitialPlanGeneration,
  processInitialPlanGeneration,
  shouldStartInitialGeneration,
} from '@/lib/initial-plan-generation'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingProfile } from '@/types/database'

export const maxDuration = 300

export async function POST() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error || !profile) {
    return NextResponse.json({ error: error?.message ?? 'Profile not found' }, { status: 404 })
  }

  const result = await enqueueInitialPlanGeneration(admin, profile as OnboardingProfile)
  if (result.error || !result.job) {
    return NextResponse.json({ error: result.error ?? 'Could not queue generation' }, { status: 422 })
  }

  if (shouldStartInitialGeneration(result.job.status)) {
    after(() => processInitialPlanGeneration(result.job!.id))
  }

  return NextResponse.json({
    success: true,
    status: result.job.status,
    deduplicated: result.deduplicated,
  }, { status: result.deduplicated ? 200 : 202 })
}
