import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin/api-auth'
import { createEnrollmentInvite } from '@/lib/redemption-codes'
import { isEmailConfigured } from '@/lib/notifications/email-provider'

/**
 * Admin: generate a 24h enrollment invite link (and email it when Resend is configured).
 * Use this to WhatsApp the link when email delivery is unavailable.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: { code?: string; email?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await createEnrollmentInvite({
      code: typeof body.code === 'string' ? body.code : '',
      email: typeof body.email === 'string' ? body.email : '',
      name: typeof body.name === 'string' ? body.name : '',
      allowLinkWithoutEmail: true,
    })

    return NextResponse.json({
      ...result,
      emailConfigured: isEmailConfigured(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not create invite' },
      { status: 400 }
    )
  }
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response
  return NextResponse.json({ emailConfigured: isEmailConfigured() })
}
