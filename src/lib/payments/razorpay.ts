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
