import type { DataStatus, GraphqlInspectResult } from './diagnostic-types'

/**
 * Shopify GraphQL can return HTTP 200 with an `errors` array.
 * HTTP 200 is never treated as success by itself.
 */
export function interpretShopifyGraphqlResponse(input: {
  httpStatus: number
  json: unknown
  requestId?: string | null
}): GraphqlInspectResult {
  const request_id = input.requestId ?? null
  const http_ok = input.httpStatus >= 200 && input.httpStatus < 300
  const json = input.json
  const errorsRaw =
    json && typeof json === 'object' && Array.isArray((json as { errors?: unknown }).errors)
      ? ((json as { errors: { message?: unknown }[] }).errors as { message?: unknown }[])
      : []
  const errors = errorsRaw.map((e) => ({
    message: typeof e?.message === 'string' ? e.message : 'GraphQL error',
  }))
  const data =
    json && typeof json === 'object' ? ((json as { data?: unknown }).data ?? null) : null
  const hasErrors = errors.length > 0
  const graphql_ok = http_ok && !hasErrors && data != null

  let data_status: DataStatus = 'unknown'
  if (!http_ok) data_status = 'failed'
  else if (hasErrors && data != null) data_status = 'partial'
  else if (hasErrors) data_status = 'failed'
  else if (data == null) data_status = 'unavailable'
  else data_status = 'verified'

  return {
    http_status: input.httpStatus,
    http_ok,
    graphql_ok,
    errors,
    data,
    data_status,
    request_id,
  }
}
