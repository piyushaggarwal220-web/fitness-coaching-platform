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
import { isDevToolkitEnabledServer } from '@/lib/dev-mode'
import { createAdminClient } from '@/lib/supabase/admin'

function assertDevToolkitAccess() {
  if (!isDevToolkitEnabledServer()) {
    return NextResponse.json(
      { error: 'Developer toolkit is disabled outside development' },
      { status: 403 }
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required for dev operations' },
      { status: 500 }
    )
  }

  return null
}

type DevImportBody =
  | { action: 'manifest'; manifestPath?: string; skipIfCategoryPublished?: boolean }
  | { action: 'single'; prompt: PromptImportInput; skipIfCategoryPublished?: boolean }
  | { action: 'batch'; prompts: PromptImportInput[]; skipIfCategoryPublished?: boolean }
  | { action: 'verify' }

export async function POST(request: Request) {
  const denied = assertDevToolkitAccess()
  if (denied) return denied

  let body: DevImportBody
  try {
    body = (await request.json()) as DevImportBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (body.action === 'verify') {
    const verification = await verifyImportedPrompts(admin)
    return NextResponse.json({ success: verification.ok, verification })
  }

  if (body.action === 'manifest') {
    const manifestPath =
      body.manifestPath?.trim() ||
      path.join(process.cwd(), 'prompts', 'production', 'manifest.json')

    const result = await importProductionPromptManifest(admin, null, manifestPath, {
      skipIfCategoryPublished: body.skipIfCategoryPublished ?? true,
    })

    return NextResponse.json({
      success: result.errors.length === 0 && result.verification.ok,
      message: summarizeImportBatch(result),
      ...result,
    })
  }

  if (body.action === 'single') {
    const prompt = body.prompt
    if (!prompt?.slug || !prompt.category || typeof prompt.prompt_body !== 'string') {
      return NextResponse.json(
        { error: 'prompt.slug, prompt.category, and prompt.prompt_body are required.' },
        { status: 400 }
      )
    }
    if (!isImportablePromptCategory(prompt.category)) {
      return NextResponse.json({ error: 'Unsupported prompt category.' }, { status: 400 })
    }

    const result = await importPublishedPrompt(admin, null, prompt, {
      skipIfCategoryPublished: body.skipIfCategoryPublished ?? true,
    })
    const verification = await verifyImportedPrompts(admin)
    return NextResponse.json({
      success: !result.error,
      imported: result.data,
      error: result.error,
      verification,
    })
  }

  if (body.action === 'batch') {
    const result = await importPublishedPrompts(admin, null, body.prompts ?? [], {
      skipIfCategoryPublished: body.skipIfCategoryPublished ?? true,
    })
    const verification = await verifyImportedPrompts(admin)
    return NextResponse.json({
      success: result.errors.length === 0,
      message: summarizeImportBatch(result),
      ...result,
      verification,
    })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function GET() {
  const denied = assertDevToolkitAccess()
  if (denied) return denied

  const admin = createAdminClient()
  const verification = await verifyImportedPrompts(admin)
  return NextResponse.json({ success: verification.ok, verification })
}
