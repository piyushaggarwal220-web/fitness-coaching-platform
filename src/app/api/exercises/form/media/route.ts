import { requireApiUser } from '@/lib/api-auth'
import { lookupExerciseForm } from '@/lib/exercise-form/lookup'
import {
  fetchMuscleWikiMedia,
  pickFormVideo,
} from '@/lib/exercise-form/musclewiki'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const name = url.searchParams.get('name')?.trim() ?? ''
  const gender = url.searchParams.get('gender') === 'female' ? 'female' : 'male'
  if (!name) {
    return new Response('name is required', { status: 400 })
  }

  try {
    const result = await lookupExerciseForm(name)
    const video = pickFormVideo(result.videos, gender)
    if (!video) {
      return new Response('No form video', { status: 404 })
    }

    const range = request.headers.get('range')
    const upstream = await fetchMuscleWikiMedia(video.url, range)
    const headers = new Headers()
    for (const key of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
    ]) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'private, no-store')
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch {
    return new Response('Form video unavailable', { status: 502 })
  }
}
