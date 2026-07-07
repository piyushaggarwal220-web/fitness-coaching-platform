import path from 'node:path'
import { NextResponse } from 'next/server'
import {
  importProductionPromptManifest,
  importPublishedPrompt,
  importPublishedPrompts,
  isImportablePromptCategory,
  summarizeImportBatch,
  verifyImportedPrompts,
  type PromptImportInput,
} from '@/lib/admin/prompt-import'
import { isAdminRole } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type ImportBody =
  | PromptImportInput
  | {
      prompts: PromptImportInput[]
      skipIfCategoryPublished?: boolean
    }
  | {
      action: 'manifest'
      manifestPath?: string
      skipIfCategoryPublished?: boolean
    }

function isBatchBody(body: ImportBody): body is {
  prompts: PromptImportInput[]
  skipIfCategoryPublished?: boolean
} {
  return Array.isArray((body as { prompts?: unknown }).prompts)
}

function isManifestBody(body: ImportBody): body is {
  action: 'manifest'
  manifestPath?: string
  skipIfCategoryPublished?: boolean
} {
  return (body as { action?: unknown }).action === 'manifest'
}

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

  let body: ImportBody
  try {
    body = (await request.json()) as ImportBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (isManifestBody(body)) {
    const manifestPath =
      body.manifestPath?.trim() ||
      path.join(process.cwd(), 'prompts', 'production', 'manifest.json')

    const result = await importProductionPromptManifest(supabase, user.id, manifestPath, {
      skipIfCategoryPublished: body.skipIfCategoryPublished ?? true,
    })

    return NextResponse.json({
      success: result.errors.length === 0 && result.verification.ok,
      message: summarizeImportBatch(result),
      ...result,
    })
  }

  if (isBatchBody(body)) {
    const result = await importPublishedPrompts(supabase, user.id, body.prompts, {
      skipIfCategoryPublished: body.skipIfCategoryPublished ?? true,
    })
    const verification = await verifyImportedPrompts(supabase)
    return NextResponse.json({ success: result.errors.length === 0, ...result, verification })
  }

  if (!body.slug || !body.category || typeof body.prompt_body !== 'string') {
    return NextResponse.json(
      { error: 'slug, category, and prompt_body are required.' },
      { status: 400 }
    )
  }

  if (!isImportablePromptCategory(body.category)) {
    return NextResponse.json({ error: 'Unsupported prompt category.' }, { status: 400 })
  }

  const result = await importPublishedPrompt(supabase, user.id, body)
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Import failed.' }, { status: 422 })
  }

  const verification = await verifyImportedPrompts(supabase)
  return NextResponse.json({ success: true, imported: result.data, verification })
}

export async function GET() {
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

  const verification = await verifyImportedPrompts(supabase)
  return NextResponse.json({ success: true, verification })
}
