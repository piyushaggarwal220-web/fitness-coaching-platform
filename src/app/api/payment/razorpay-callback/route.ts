import { NextResponse } from 'next/server'
import { resolveAppBaseUrl } from '@/lib/admin/portal-urls'
import { completeCheckoutPayment } from '@/lib/payments/complete-checkout-payment'

export const dynamic = 'force-dynamic'

function appRedirect(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, resolveAppBaseUrl()), 303)
}

function checkoutPath(plan: string, paymentReturn: 'failed' | 'unconfirmed'): string {
  const params = new URLSearchParams()
  if (plan) params.set('plan', plan)
  params.set('paymentReturn', paymentReturn)
  return `/checkout?${params.toString()}`
}

async function readFields(request: Request): Promise<Record<string, string>> {
  const url = new URL(request.url)
  const fields: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    fields[key] = value
  })
  if (request.method !== 'POST') return fields

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string' && value) fields[key] = value
      }
    }
    return fields
  }

  const form = await request.formData().catch(() => null)
  if (!form) return fields
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && value) fields[key] = value
  }
  return fields
}

async function handle(request: Request): Promise<NextResponse> {
  const fields = await readFields(request)
  const plan = fields.plan?.trim() ?? ''
  const orderId = fields.razorpay_order_id?.trim() ?? ''
  const paymentId = fields.razorpay_payment_id?.trim() ?? ''
  const signature = fields.razorpay_signature?.trim() ?? ''
  const failed = Boolean(fields['error[code]'] || fields['error[description]'] || fields.error)

  if (failed || !orderId || !paymentId || !signature) {
    return appRedirect(checkoutPath(plan, 'failed'))
  }

  const result = await completeCheckoutPayment({
    request,
    planSlug: plan || null,
    orderId,
    paymentId,
    signature,
    identityFromOrder: true,
  })

  if (!result.ok) {
    return appRedirect(checkoutPath(plan, result.status === 400 ? 'failed' : 'unconfirmed'))
  }

  return NextResponse.redirect(result.redirectTo, 303)
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
