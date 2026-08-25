import { requireApiUser } from '@/lib/api-auth'
import { profileEntitledForExerciseLibrary } from '@/lib/addon-protocols'
import { lookupExerciseForm } from '@/lib/exercise-form/lookup'
import {
  getCachedMuscleWikiMedia,
  mediaResponseFromCache,
  pickFormVideo,
  type FormDemoGender,
} from '@/lib/exercise-form/musclewiki'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('exercise_library_entitled')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (!profileEntitledForExerciseLibrary(profile)) {
    return new Response('Exercise library locked', { status: 403 })
  }

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

    const cached = await getCachedMuscleWikiMedia(mediaUrl)
    const range = kind === 'video' ? request.headers.get('range') : null
    return mediaResponseFromCache(cached, range)
  } catch {
    return new Response('Form video unavailable', { status: 502 })
  }
}
