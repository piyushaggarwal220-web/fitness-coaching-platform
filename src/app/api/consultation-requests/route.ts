import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import {
  CONSULTATION_IP_HOURLY_LIMIT,
  consultationQuota,
  isConsultationLimitError,
  validateConsultationRequest,
} from '@/lib/consultation-requests'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ORIGINS = new Set([
  'https://lurvox.in',
  'https://www.lurvox.in',
  'https://9uwyq1-0j.myshopify.com',
  'https://app.lurvox.in',
])

function requestOrigin(request: Request): string | null {
  return request.headers.get('origin')
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true
  if (ALLOWED_ORIGINS.has(origin)) return true
  return process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(?::\d+)?$/.test(origin)
}

function corsHeaders(origin: string | null): HeadersInit {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function json(
  request: Request,
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: corsHeaders(requestOrigin(request)),
  })
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
}

function keyedHash(value: string, purpose: 'person' | 'ip'): string {
  const secret =
    process.env.CONSULTATION_REQUEST_HASH_SECRET?.trim() ||
    process.env.POLICY_ACK_IP_SALT?.trim() ||
    'lurvox-consultation-v1'
  return createHmac('sha256', `${secret}:${purpose}`).update(value).digest('hex')
}

async function countForPerson(
  admin: ReturnType<typeof createAdminClient>,
  personKey: string
): Promise<{ count: number | null; error: { message: string } | null }> {
  const { count, error } = await admin
    .from('consultation_requests')
    .select('id', { count: 'exact', head: true })
    .eq('person_key', personKey)

  return { count, error }
}

async function existingIdempotentRequest(
  admin: ReturnType<typeof createAdminClient>,
  idempotencyKey: string
) {
  return admin
    .from('consultation_requests')
    .select('id, person_key')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
}

export async function OPTIONS(request: Request) {
  const origin = requestOrigin(request)
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403, headers: corsHeaders(null) })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = requestOrigin(request)
  if (!isAllowedOrigin(origin)) {
    return json(request, { error: 'This form can only be submitted from LURVOX' }, 403)
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return json(request, { error: 'Request is too large' }, 413)
  }

  let rawBody: Record<string, unknown>
  try {
    rawBody = (await request.json()) as Record<string, unknown>
  } catch {
    return json(request, { error: 'Invalid request' }, 400)
  }

  const validation = validateConsultationRequest(rawBody)
  if (!validation.ok) {
    return json(request, { error: validation.error }, 400)
  }

  const input = validation.value
  const personKey = keyedHash(input.phoneE164, 'person')
  const ip = clientIp(request)
  const ipHash = ip ? keyedHash(ip, 'ip') : null
  const admin = createAdminClient()

  const { data: existing, error: existingError } = await existingIdempotentRequest(
    admin,
    input.idempotencyKey
  )
  if (existingError) {
    console.error('[consultation-requests] idempotency lookup failed', {
      error: existingError.message,
    })
    return json(request, { error: 'Could not submit your details. Please retry.' }, 500)
  }
  if (existing) {
    if (existing.person_key !== personKey) {
      return json(request, { error: 'Refresh the page and try again' }, 409)
    }
    const quotaResult = await countForPerson(admin, personKey)
    if (quotaResult.error) {
      return json(request, { error: 'Could not confirm your submission' }, 500)
    }
    return json(request, {
      success: true,
      requestId: existing.id,
      deduplicated: true,
      ...consultationQuota(quotaResult.count ?? 0),
    })
  }

  if (ipHash) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error } = await admin
      .from('consultation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneHourAgo)

    if (error) {
      console.error('[consultation-requests] rate limit lookup failed', {
        error: error.message,
      })
      return json(request, { error: 'Could not submit your details. Please retry.' }, 500)
    }
    if ((count ?? 0) >= CONSULTATION_IP_HOURLY_LIMIT) {
      return json(
        request,
        { error: 'Too many consultation requests. Please try again later.' },
        429
      )
    }
  }

  const { data: created, error: createError } = await admin
    .from('consultation_requests')
    .insert({
      person_key: personKey,
      idempotency_key: input.idempotencyKey,
      name: input.name,
      email: input.email,
      phone_e164: input.phoneE164,
      source: 'talk_to_a_coach',
      ip_hash: ipHash,
    })
    .select('id')
    .single()

  if (createError) {
    if (isConsultationLimitError(createError)) {
      return json(
        request,
        {
          error: 'You have already used both Talk to a coach submissions.',
          code: 'CONSULTATION_REQUEST_LIMIT',
          ...consultationQuota(2),
        },
        429
      )
    }

    if (createError.code === '23505') {
      const { data: raced } = await existingIdempotentRequest(admin, input.idempotencyKey)
      if (raced?.person_key === personKey) {
        const quotaResult = await countForPerson(admin, personKey)
        return json(request, {
          success: true,
          requestId: raced.id,
          deduplicated: true,
          ...consultationQuota(quotaResult.count ?? 0),
        })
      }
    }

    console.error('[consultation-requests] create failed', {
      error: createError.message,
      code: createError.code,
    })
    return json(request, { error: 'Could not submit your details. Please retry.' }, 500)
  }

  const quotaResult = await countForPerson(admin, personKey)
  if (quotaResult.error) {
    console.error('[consultation-requests] quota lookup failed after create', {
      requestId: created.id,
      error: quotaResult.error.message,
    })
  }
  const quota = consultationQuota(quotaResult.count ?? 1)

  return json(
    request,
    {
      success: true,
      requestId: created.id,
      deduplicated: false,
      ...quota,
    },
    201
  )
}
