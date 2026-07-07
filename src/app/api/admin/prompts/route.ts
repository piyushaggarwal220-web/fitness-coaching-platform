import { NextResponse } from 'next/server'
import { createPromptLibraryEntry } from '@/lib/admin/prompt-library'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { PromptLibraryFormData } from '@/types/database'

export async function POST(request: Request) {
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

  let body: PromptLibraryFormData
  try {
    body = (await request.json()) as PromptLibraryFormData
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await createPromptLibraryEntry(supabase, user.id, body)
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Failed to create prompt' }, { status: 422 })
  }

  return NextResponse.json({ prompt: result.data })
}
