import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { listYMoveExercises } from '@/lib/ymove/client'

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
    const includeVideos = url.searchParams.get('includeVideos') === '1' || url.searchParams.get('includeVideos') === 'true'

    const result = await listYMoveExercises({
      search: url.searchParams.get('search') ?? undefined,
      muscleGroup: url.searchParams.get('muscleGroup') ?? undefined,
      equipment: url.searchParams.get('equipment') ?? undefined,
      exerciseType: url.searchParams.get('exerciseType') ?? undefined,
      difficulty: url.searchParams.get('difficulty') ?? undefined,
      page: Number(url.searchParams.get('page') ?? 1) || 1,
      pageSize: Math.min(40, Number(url.searchParams.get('pageSize') ?? 20) || 20),
      includeVideos,
      hasVideo: true,
    })

    return NextResponse.json({
      success: true,
      exercises: result.data ?? [],
      pagination: result.pagination ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exercises'
    console.error('[exercises] list failed:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
