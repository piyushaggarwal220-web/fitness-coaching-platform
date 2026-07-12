import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateConversation } from '@/lib/coach-chat'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error, isNew } = await getOrCreateConversation(supabase, user.id)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ conversation: data, isNew })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error, isNew } = await getOrCreateConversation(supabase, user.id)
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ conversation: data, isNew })
}
