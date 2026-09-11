'use client'

import { isPublicDemoEmail } from '@/lib/public-demo'
import { invalidateSessionCache } from '@/lib/session-restore'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/** Drop the public demo session so checkout can collect a real buyer email. */
export async function leavePublicDemoSession(): Promise<void> {
  const { data } = await supabase.auth.getUser()
  if (!isPublicDemoEmail(data.user?.email)) return
  await supabase.auth.signOut()
  invalidateSessionCache()
}
