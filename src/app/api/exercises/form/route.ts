import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { lookupExerciseForm } from '@/lib/exercise-form/lookup'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const name = new URL(request.url).searchParams.get('name')?.trim() ?? ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    const result = await lookupExerciseForm(name)
    return NextResponse.json({
      success: true,
      configured: result.configured,
      skipped: result.skipped,
      found: result.found,
      name: result.name,
      steps: result.steps,
      muscles: result.muscles,
      exerciseId: result.exerciseId,
      hasVideo: result.videos.length > 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form lookup failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
