import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as {
    photoConsent?: boolean
    quoteConsent?: boolean
  } | null

  if (body?.photoConsent == null && body?.quoteConsent == null) {
    return NextResponse.json({ error: 'photoConsent or quoteConsent required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const patch: Record<string, string | null> = {}
  if (body?.photoConsent === true) patch.marketing_photo_consent_at = now
  if (body?.photoConsent === false) patch.marketing_photo_consent_at = null
  if (body?.quoteConsent === true) patch.marketing_quote_consent_at = now
  if (body?.quoteConsent === false) patch.marketing_quote_consent_at = null

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(patch).eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ...patch })
}
