import 'server-only'
import { NextResponse } from 'next/server'
import type { ApiAuthResult } from '@/lib/api-auth'
import {
  PUBLIC_DEMO_READ_ONLY_CODE,
  PUBLIC_DEMO_READ_ONLY_MESSAGE,
  isPublicDemoEmail,
} from '@/lib/public-demo'

export function publicDemoReadOnlyJson(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: PUBLIC_DEMO_READ_ONLY_MESSAGE,
      code: PUBLIC_DEMO_READ_ONLY_CODE,
    },
    { status: 403 }
  )
}

export function rejectIfPublicDemoMutation(auth: ApiAuthResult): ApiAuthResult {
  if (!auth.ok) return auth
  if (isPublicDemoEmail(auth.user.email)) {
    return { ok: false, response: publicDemoReadOnlyJson() }
  }
  return auth
}
