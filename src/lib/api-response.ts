export type ApiJsonBody = {
  success?: boolean
  error?: string
  [key: string]: unknown
}

/** Safely parse a fetch Response body — never throws on empty or invalid JSON. */
export async function readApiJson<T extends ApiJsonBody = ApiJsonBody>(
  res: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text()
  if (!text.trim()) {
    return {
      ok: false,
      error: res.ok ? 'Empty server response' : `Request failed (${res.status})`,
    }
  }

  try {
    const data = JSON.parse(text) as T
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? `Request failed (${res.status})`,
      }
    }
    return { ok: true, data }
  } catch {
    return {
      ok: false,
      error: `Invalid server response (${res.status})`,
    }
  }
}
