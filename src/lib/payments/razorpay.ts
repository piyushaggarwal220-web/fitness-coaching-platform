import { createHmac, timingSafeEqual } from 'crypto'

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'

export type RazorpayOrder = {
  id: string
  amount: number
  currency: string
  receipt: string
}

export type RazorpayPayment = {
  id: string
  status: string
  amount: number
  currency: string
  order_id: string
  email?: string
  contact?: string
  notes?: Record<string, string>
}

export type RazorpayRefund = {
  id: string
  payment_id: string
  amount: number
  currency: string
  status: string
  created_at: number
}

export type RazorpayOrderDetail = RazorpayOrder & {
  notes?: Record<string, string>
  status?: string
}

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured')
  }

  return { keyId, keySecret }
}

function getAuthHeader(): string {
  const { keyId, keySecret } = getCredentials()
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
}

export function getRazorpayKeyId(): string {
  return getCredentials().keyId
}

export async function createRazorpayOrder(params: {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<RazorpayOrder> {
  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to create Razorpay order: ${body}`)
  }

  return response.json() as Promise<RazorpayOrder>
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const response = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to fetch Razorpay payment: ${body}`)
  }

  return response.json() as Promise<RazorpayPayment>
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrderDetail> {
  const response = await fetch(`${RAZORPAY_API_BASE}/orders/${orderId}`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to fetch Razorpay order: ${body}`)
  }

  return response.json() as Promise<RazorpayOrderDetail>
}

export async function createRazorpayRefund(params: {
  paymentId: string
  amountPaise: number
  operationId: string
  reason: string
}): Promise<RazorpayRefund> {
  const response = await fetch(`${RAZORPAY_API_BASE}/payments/${params.paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      notes: {
        operation_id: params.operationId,
        reason: params.reason.slice(0, 200),
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Razorpay refund failed (HTTP ${response.status})`)
  }
  return response.json() as Promise<RazorpayRefund>
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const { keySecret } = getCredentials()
  const payload = `${orderId}|${paymentId}`
  const expected = createHmac('sha256', keySecret).update(payload).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

/** Verify Razorpay webhook signature (HMAC SHA256 of raw body). Env: RAZORPAY_WEBHOOK_SECRET */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim()
  if (!secret || !signature) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
