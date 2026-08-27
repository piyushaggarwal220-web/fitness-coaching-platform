import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireEntitledClientApiUser } from '@/lib/client-entitlement-guard'
import { FITBIT_ACCESS_COOKIE, FITBIT_REFRESH_COOKIE, fitbitConfigured } from '@/lib/wearables/fitbit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireEntitledClientApiUser()
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'Authentication required', fitbitConfigured: fitbitConfigured(), fitbitConnected: false },
      { status: auth.response.status }
    )
  }

  const store = await cookies()
  const connected = Boolean(
    store.get(FITBIT_ACCESS_COOKIE)?.value || store.get(FITBIT_REFRESH_COOKIE)?.value
  )

  return NextResponse.json({
    fitbitConfigured: fitbitConfigured(),
    fitbitConnected: connected,
  })
}
