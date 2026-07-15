import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { findYMoveExerciseByName, getYMoveExercise, pickPrimaryVideo } from '@/lib/ymove/client'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const auth = await requireApiUser()
    if (!auth.ok) return auth.response

    if (!process.env.EXERCISE_VIDEO_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Exercise video library is not configured' },
        { status: 503 }
      )
    }

    const { id } = await params
    const url = new URL(request.url)
    const byName = url.searchParams.get('byName') === '1'

    const exercise = byName
      ? await findYMoveExerciseByName(decodeURIComponent(id))
      : await getYMoveExercise(id, { includeVideos: true })

    if (!exercise) {
      return NextResponse.json({ success: false, error: 'Exercise not found' }, { status: 404 })
    }

    const media = pickPrimaryVideo(exercise)

    return NextResponse.json({
      success: true,
      exercise: {
        ...exercise,
        videoUrl: media.videoUrl,
        thumbnailUrl: media.thumbnailUrl,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exercise'
    console.error('[exercises] detail failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
