import { createBrowserClient } from '@supabase/ssr'

type BrowserClient = ReturnType<typeof createBrowserClient>

let browserClient: BrowserClient | undefined

/**
 * Browser Supabase client (singleton in the browser).
 *
 * Several pages call `createClient()` at module scope. During `next build`
 * prerender, some Vercel projects may not have public Supabase env vars yet —
 * `@supabase/ssr` throws and fails the whole deploy. Use inert placeholders in
 * that case so static generation can finish; runtime still needs real env.
 */
export function createClient() {
  if (typeof window !== 'undefined' && browserClient) {
    return browserClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  const client =
    url && anonKey
      ? createBrowserClient(url, anonKey)
      : createBrowserClient(
          'https://placeholder.supabase.co',
          // Minimal JWT-shaped placeholder accepted by @supabase/ssr during build.
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder'
        )

  if (typeof window !== 'undefined') {
    browserClient = client
  }

  return client
}
