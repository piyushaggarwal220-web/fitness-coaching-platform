import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import {
  forgetMemory,
  listMemory,
  remember,
  updateMemory,
} from '@/lib/jarvis/memory/business-memory'
import { MEMORY_CATEGORIES, memoryGroup } from '@/lib/jarvis/operator-present'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORY_SET = new Set<string>(MEMORY_CATEGORIES)

export async function GET(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  const category = url.searchParams.get('category') ?? undefined

  try {
    const rows = await listMemory({ query, category, limit: 100 })
    return NextResponse.json({
      success: true,
      memory: rows.map((m) => ({
        ...m,
        group: memoryGroup(String(m.category)),
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load memory' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    category?: string
    title?: string
    summary?: string
    confidence?: 'low' | 'medium' | 'high'
    tags?: string[]
  }

  if (!body.title?.trim() || !body.summary?.trim() || !body.category || !CATEGORY_SET.has(body.category)) {
    return NextResponse.json(
      { success: false, error: 'title, summary, and a valid category are required' },
      { status: 400 }
    )
  }

  try {
    const row = await remember({
      category: body.category as (typeof MEMORY_CATEGORIES)[number],
      title: body.title.trim(),
      summary: body.summary.trim(),
      confidence: body.confidence,
      tags: body.tags,
      actorId: auth.user.id,
      source: 'owner',
    })
    return NextResponse.json({ success: true, memory: row })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save memory' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    title?: string
    summary?: string
    category?: string
    confidence?: 'low' | 'medium' | 'high'
    tags?: string[]
  }
  if (!body.id) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }
  if (body.category && !CATEGORY_SET.has(body.category)) {
    return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 })
  }

  try {
    const row = await updateMemory(body as { id: string })
    return NextResponse.json({ success: true, memory: row })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update memory' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
  }
  try {
    await forgetMemory(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to forget memory' },
      { status: 500 }
    )
  }
}
