import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import {
  findYMoveExerciseByName,
  getYMoveExercise,
  pickPrimaryVideo,
  searchYMoveExerciseCandidates,
} from '@/lib/ymove/client'
import { normalizeExerciseNameKey } from '@/lib/ymove/match'

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser()
    if (!auth.ok) return auth.response

    if (!process.env.EXERCISE_VIDEO_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Exercise video library is not configured' },
        { status: 503 }
      )
    }

    const url = new URL(request.url)
    const name = url.searchParams.get('name')?.trim()
    const mode = url.searchParams.get('mode') ?? 'resolve'

    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
    }

    const nameKey = normalizeExerciseNameKey(name)

    if (mode === 'candidates') {
      const candidates = await searchYMoveExerciseCandidates(name, 12)
      return NextResponse.json({
        success: true,
        nameKey,
        candidates: candidates.map((ex) => ({
          id: ex.id,
          title: ex.title,
          slug: ex.slug,
          muscleGroup: ex.muscleGroup,
          equipment: ex.equipment,
          thumbnailUrl: ex.thumbnailUrl,
          hasVideo: ex.hasVideo,
        })),
      })
    }

    // Prefer a saved correction
    const { data: override } = await auth.supabase
      .from('exercise_demo_overrides')
      .select('ymove_exercise_id, ymove_title')
      .eq('name_key', nameKey)
      .maybeSingle()

    let exercise = override?.ymove_exercise_id
      ? await getYMoveExercise(override.ymove_exercise_id, { includeVideos: true })
      : null

    let source: 'override' | 'auto' = 'override'
    if (!exercise) {
      exercise = await findYMoveExerciseByName(name)
      source = 'auto'
    }

    if (!exercise) {
      return NextResponse.json({ success: false, error: 'No demo video found for this exercise' }, { status: 404 })
    }

    const media = pickPrimaryVideo(exercise)
    if (!media.videoUrl) {
      return NextResponse.json({ success: false, error: 'No demo video found for this exercise' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      source,
      nameKey,
      exercise: {
        ...exercise,
        videoUrl: media.videoUrl,
        thumbnailUrl: media.thumbnailUrl,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resolve exercise demo'
    console.error('[exercises/demo] GET failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser()
    if (!auth.ok) return auth.response

    if (!process.env.EXERCISE_VIDEO_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Exercise video library is not configured' },
        { status: 503 }
      )
    }

    let body: { name?: string; ymoveExerciseId?: string }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const name = body.name?.trim()
    const ymoveExerciseId = body.ymoveExerciseId?.trim()
    if (!name || !ymoveExerciseId) {
      return NextResponse.json(
        { success: false, error: 'name and ymoveExerciseId are required' },
        { status: 400 }
      )
    }

    const exercise = await getYMoveExercise(ymoveExerciseId, { includeVideos: true })
    const media = pickPrimaryVideo(exercise)
    if (!media.videoUrl) {
      return NextResponse.json({ success: false, error: 'Selected exercise has no video' }, { status: 400 })
    }

    const nameKey = normalizeExerciseNameKey(name)
    const now = new Date().toISOString()

    const { error } = await auth.supabase.from('exercise_demo_overrides').upsert(
      {
        name_key: nameKey,
        display_name: name,
        ymove_exercise_id: exercise.id,
        ymove_slug: exercise.slug,
        ymove_title: exercise.title,
        updated_by: auth.user.id,
        updated_at: now,
      },
      { onConflict: 'name_key' }
    )

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      source: 'override' as const,
      nameKey,
      exercise: {
        ...exercise,
        videoUrl: media.videoUrl,
        thumbnailUrl: media.thumbnailUrl,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save exercise demo link'
    console.error('[exercises/demo] POST failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
