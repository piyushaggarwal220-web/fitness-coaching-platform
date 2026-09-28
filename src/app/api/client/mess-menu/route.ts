import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { rejectIfPublicDemoMutation } from '@/lib/public-demo-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_TEXT = 4000

function istWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const utc = new Date(Date.UTC(year, month - 1, day))
  const weekday = utc.getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  utc.setUTCDate(utc.getUTCDate() + mondayOffset)
  return utc.toISOString().slice(0, 10)
}

function readMessMenu(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const menu = (raw as { messMenu?: unknown }).messMenu
  if (!menu || typeof menu !== 'object') return null
  const row = menu as { weekStart?: unknown; text?: unknown; photoPath?: unknown; updatedAt?: unknown }
  return {
    weekStart: typeof row.weekStart === 'string' ? row.weekStart : null,
    text: typeof row.text === 'string' ? row.text : '',
    photoPath: typeof row.photoPath === 'string' ? row.photoPath : null,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
  }
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('onboarding_data')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messMenu: readMessMenu(data?.onboarding_data), weekStart: istWeekStart() })
}

export async function POST(request: Request) {
  const auth = rejectIfPublicDemoMutation(await requireApiUser())
  if (!auth.ok) return auth.response

  let body: { text?: string; photoPath?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  const photoPath = body.photoPath?.trim() || null
  if (!text && !photoPath) {
    return NextResponse.json({ error: 'Write the menu or upload a photo.' }, { status: 400 })
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: 'Keep the menu under 4000 characters.' }, { status: 400 })
  }
  if (photoPath && !photoPath.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: 'That photo does not belong to this account.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: profile, error: readError } = await admin
    .from('profiles')
    .select('onboarding_data')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (readError || !profile) {
    return NextResponse.json({ error: readError?.message ?? 'Profile not found' }, { status: 500 })
  }

  const current =
    profile.onboarding_data && typeof profile.onboarding_data === 'object'
      ? (profile.onboarding_data as Record<string, unknown>)
      : {}
  const messMenu = {
    weekStart: istWeekStart(),
    text,
    photoPath,
    updatedAt: new Date().toISOString(),
  }
  const { error } = await admin
    .from('profiles')
    .update({ onboarding_data: { ...current, messMenu } })
    .eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ messMenu })
}
