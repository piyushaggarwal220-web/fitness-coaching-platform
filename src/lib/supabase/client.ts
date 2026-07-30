import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client.
 *
 * Several pages call `createClient()` at module scope. During `next build`
 * prerender, some Vercel projects may not have public Supabase env vars yet —
 * `@supabase/ssr` throws and fails the whole deploy. Use inert placeholders in
 * that case so static generation can finish; runtime still needs real env.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (url && anonKey) {
    return createBrowserClient(url, anonKey)
  }

  return createBrowserClient(
    'https://placeholder.supabase.co',
    // Minimal JWT-shaped placeholder accepted by @supabase/ssr during build.
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder'
  )
}
