import { NextResponse } from 'next/server'
import { getPromptWithVersions, renderPromptPreview } from '@/lib/admin/prompt-library'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: { versionId?: string; clientId?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: prompt, error } = await getPromptWithVersions(supabase, id)
  if (error || !prompt) {
    return NextResponse.json({ error: error ?? 'Prompt not found' }, { status: 404 })
  }

  const version =
    (body.versionId ? prompt.versions.find((v) => v.id === body.versionId) : null) ??
    prompt.draft_version ??
    prompt.published_version

  if (!version) {
    return NextResponse.json({ error: 'No version available to preview' }, { status: 422 })
  }

  let clientProfile: {
    name: string | null
    age: string | number | null
    gender: string | null
    fitness_goal: string | null
    weight: string | number | null
    height: string | number | null
  } | null = null

  if (body.clientId) {
    const { data } = await supabase
      .from('profiles')
      .select('name, age, gender, fitness_goal, weight, height')
      .eq('id', body.clientId)
      .eq('role', 'client')
      .maybeSingle()
    clientProfile = data
  }

  const preview = renderPromptPreview(version.prompt_body, clientProfile)
  return NextResponse.json({
    ...preview,
    version: version.version,
    versionId: version.id,
    versionStatus: version.status,
  })
}
