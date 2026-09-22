/**
 * Instagram Login Graph HTTP client (graph.instagram.com).
 * Uses INSTAGRAM_ACCESS_TOKEN only — never Meta Ads tokens.
 * Secrets stay server-side; errors never include raw tokens.
 */

import { MetaApiError } from '@/lib/ai-marketing/meta/client'

export type InstagramGraphCredentials = {
  accessToken: string
  apiVersion: string
}

export type InstagramGraphClient = {
  get: <T = unknown>(path: string, query?: Record<string, string>) => Promise<T>
  post: <T = unknown>(path: string, body?: Record<string, unknown>) => Promise<T>
  credentials: InstagramGraphCredentials
  timeoutMs: number
  host: 'graph.instagram.com'
}

export type InstagramGraphClientOptions = {
  timeoutMs?: number
}

/**
 * Instagram API with Instagram Login uses graph.instagram.com
 * (not graph.facebook.com). See Meta Instagram Login get-started docs.
 */
export function createInstagramGraphClient(
  credentials: InstagramGraphCredentials,
  opts?: InstagramGraphClientOptions
): InstagramGraphClient {
  const base = `https://graph.instagram.com/${credentials.apiVersion}`
  const timeoutMs = opts?.timeoutMs ?? 20_000

  async function request<T>(
    method: 'GET' | 'POST',
    path: string,
    queryOrBody?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`)
    const headers: Record<string, string> = {}

    let init: RequestInit
    if (method === 'GET') {
      url.searchParams.set('access_token', credentials.accessToken)
      if (queryOrBody) {
        for (const [k, v] of Object.entries(queryOrBody)) {
          if (v === undefined || v === null) continue
          url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
        }
      }
      init = { method: 'GET' }
    } else {
      const form = new URLSearchParams()
      form.set('access_token', credentials.accessToken)
      if (queryOrBody) {
        for (const [k, v] of Object.entries(queryOrBody)) {
          if (v === undefined || v === null) continue
          form.set(k, typeof v === 'string' ? v : JSON.stringify(v))
        }
      }
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
      init = { method: 'POST', headers, body: form.toString() }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url.toString(), { ...init, signal: controller.signal })
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string; code?: number }; [k: string]: unknown }
        | null

      if (!res.ok || json?.error) {
        throw new MetaApiError(
          json?.error?.message || `Instagram API ${method} ${path} failed (${res.status})`,
          res.status,
          json?.error
            ? { code: json.error.code, message: json.error.message }
            : { status: res.status }
        )
      }
      return json as T
    } catch (err) {
      if (err instanceof MetaApiError) throw err
      if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
        throw new MetaApiError(`Instagram API ${method} ${path} timed out after ${timeoutMs}ms`, 408)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    credentials,
    timeoutMs,
    host: 'graph.instagram.com',
    get: (path, query) => request('GET', path, query),
    post: (path, body) => request('POST', path, body),
  }
}
