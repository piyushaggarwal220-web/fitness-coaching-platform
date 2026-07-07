import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createTrialClient } from '@/lib/admin/testing-accounts'
import { FITNESS_GOAL_OPTIONS } from '@/lib/onboarding'

const VALID_GOALS = new Set(FITNESS_GOAL_OPTIONS.map((option) => option.value))

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    email?: string
    password?: string
    fitnessGoal?: string | null
    coachId?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const fitnessGoal = body.fitnessGoal?.trim() || null
  if (fitnessGoal && !VALID_GOALS.has(fitnessGoal as (typeof FITNESS_GOAL_OPTIONS)[number]['value'])) {
    return NextResponse.json({ success: false, error: 'Invalid fitness goal' }, { status: 400 })
  }

  try {
    const account = await createTrialClient({
      name: body.name?.trim() ?? '',
      email: body.email?.trim() ?? '',
      password: body.password?.trim() ?? '',
      fitnessGoal,
      coachId: body.coachId?.trim() || null,
    })

    return NextResponse.json({ success: true, account })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create trial client'
    const status = message.includes('already exists') ? 409 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
