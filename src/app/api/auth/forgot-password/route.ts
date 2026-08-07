import { NextResponse } from 'next/server'
import { resolveAuthEmailRedirectOrigin } from '@/lib/admin/portal-urls'
import { sendDirectEmail, isEmailConfigured } from '@/lib/notifications/email-provider'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createBrowserStyleClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = { email?: string }

/**
 * Password reset that works across devices/browsers.
 *
 * Uses admin.generateLink + our own token_hash URL (verified in /auth/callback),
 * instead of PKCE resetPasswordForEmail which fails when the email is opened
 * on a different device than the one that requested the reset.
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter the email you use to sign in.' }, { status: 400 })
  }

  const origin = resolveAuthEmailRedirectOrigin(new URL(request.url).origin)
  const nextPath = '/reset-password'
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`

  // Always return a generic success payload to avoid account enumeration.
  const okResponse = () =>
    NextResponse.json({
      success: true,
      message:
        'If an account exists for that email, a reset link is on its way. Check inbox and spam.',
    })

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    if (error || !data?.properties?.hashed_token) {
      // Unknown email / generation failure — still look successful to the client.
      console.warn('[forgot-password] generateLink:', error?.message || 'missing hashed_token')
      return okResponse()
    }

    const resetUrl =
      `${origin}/auth/callback` +
      `?token_hash=${encodeURIComponent(data.properties.hashed_token)}` +
      `&type=recovery` +
      `&next=${encodeURIComponent(nextPath)}`

    if (isEmailConfigured()) {
      const sent = await sendDirectEmail({
        to: email,
        subject: 'Reset your LURVOX password',
        text: [
          'Reset your LURVOX login password using this link:',
          resetUrl,
          '',
          'This link expires soon. If you did not request a reset, you can ignore this email.',
        ].join('\n'),
        html: `
          <p style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#111">
            Reset your LURVOX login password:
          </p>
          <p style="font-family:sans-serif;margin:20px 0">
            <a href="${resetUrl}" style="background:#f97316;color:#111;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">
              Create new password
            </a>
          </p>
          <p style="font-family:sans-serif;font-size:13px;line-height:1.5;color:#555">
            Or paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color:#ea580c;word-break:break-all">${resetUrl}</a>
          </p>
          <p style="font-family:sans-serif;font-size:12px;color:#777">
            This link expires soon. If you did not request a reset, ignore this email.
          </p>
        `,
      })

      if (!sent.ok) {
        console.error('[forgot-password] email send failed:', sent.error)
        // Fall back to Supabase Auth email (same-browser PKCE) so the user still gets something.
        await fallbackSupabaseResetEmail(email, redirectTo)
      } else if (sent.skipped) {
        await fallbackSupabaseResetEmail(email, redirectTo)
      }
    } else {
      await fallbackSupabaseResetEmail(email, redirectTo)
    }

    return okResponse()
  } catch (err) {
    console.error('[forgot-password] unexpected:', err)
    return okResponse()
  }
}

async function fallbackSupabaseResetEmail(email: string, redirectTo: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anon) return
  const client = createBrowserStyleClient(url, anon)
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    console.warn('[forgot-password] supabase fallback:', error.message)
  }
}
