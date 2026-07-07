import { NextResponse } from 'next/server'
import {
  archivePromptLibrary,
  createPromptDraft,
  publishPromptDraft,
  restorePromptVersion,
  updatePromptDraft,
} from '@/lib/admin/prompt-library'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { PromptLibraryCategory } from '@/types/database'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
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

  let body: {
    prompt_body: string
    description?: string
    name?: string
    category?: PromptLibraryCategory
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updatePromptDraft(supabase, id, body)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}

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

  let body: { action: string; versionId?: string; sourceVersionId?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let error: string | null = null
  switch (body.action) {
    case 'create_draft':
      error = (await createPromptDraft(supabase, user.id, id, body.sourceVersionId)).error
      break
    case 'publish':
      error = (await publishPromptDraft(supabase, id)).error
      break
    case 'archive':
      error = (await archivePromptLibrary(supabase, id)).error
      break
    case 'restore':
      if (!body.versionId) {
        return NextResponse.json({ error: 'versionId is required' }, { status: 400 })
      }
      error = (await restorePromptVersion(supabase, user.id, id, body.versionId)).error
      break
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  if (error) {
    return NextResponse.json({ error }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}
