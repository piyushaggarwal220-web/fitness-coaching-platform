import { requireApiUser } from '@/lib/api-auth'
import { lookupExerciseForm } from '@/lib/exercise-form/lookup'
import {
  fetchMuscleWikiMedia,
  pickFormVideo,
  type FormDemoGender,
} from '@/lib/exercise-form/musclewiki'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const name = url.searchParams.get('name')?.trim() ?? ''
  const gender: FormDemoGender = url.searchParams.get('gender') === 'female' ? 'female' : 'male'
  const angle = url.searchParams.get('angle')?.trim() || 'front'
  const kind = url.searchParams.get('kind') === 'poster' ? 'poster' : 'video'
  if (!name) {
    return new Response('name is required', { status: 400 })
  }

  try {
    const result = await lookupExerciseForm(name)
    const video = pickFormVideo(result.videos, gender, angle)
    if (!video) {
      return new Response('No form video', { status: 404 })
    }
    const mediaUrl = kind === 'poster' ? video.previewUrl : video.url
    if (!mediaUrl) {
      return new Response('No form poster', { status: 404 })
    }

    const range = kind === 'video' ? request.headers.get('range') : null
    const upstream = await fetchMuscleWikiMedia(mediaUrl, range)
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
    if (!headers.has('Cache-Control')) {
      headers.set('Cache-Control', kind === 'poster' ? 'private, max-age=86400' : 'private, no-store')
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch {
    return new Response('Form video unavailable', { status: 502 })
  }
}
