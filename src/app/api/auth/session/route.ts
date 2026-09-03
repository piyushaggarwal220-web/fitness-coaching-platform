import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same-origin session lookup so phones that cannot reach supabase.co still restore login. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ user: null, profile: null }, { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
  })
}
