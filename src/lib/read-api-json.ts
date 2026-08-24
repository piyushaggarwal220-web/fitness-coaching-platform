/** Parse an API body as JSON. Hosting 402s often return plain text like "Payment required". */
export async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(friendlyNonJsonError(res.status, text))
  }
}

export function friendlyNonJsonError(status: number, text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (status === 402 || /^payment required/i.test(compact)) {
    return 'The server could not complete this right now. Please wait a minute and try again.'
  }
  if (status === 413) return 'That request was too large. Shorten the text and try again.'
  if (status === 429) return 'Too many requests. Please wait a minute and try again.'
  if (status >= 500) return 'The server had a problem. Please try again.'
  if (compact.length > 0 && compact.length < 160 && !compact.startsWith('<')) {
    return compact
  }
  return `Request failed (${status || 'network'}). Please try again.`
}
