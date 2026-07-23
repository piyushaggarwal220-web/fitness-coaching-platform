import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHOPIFY_STORE = process.env.SHOPIFY_STORE?.trim() || '9uwyq1-0j.myshopify.com'
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION?.trim() || '2025-01'
export const SHOPIFY_API = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
export const SHOPIFY_TOKEN_PATH =
  process.env.SHOPIFY_AUTH_TOKEN_PATH?.trim() || path.join(os.tmpdir(), 'shopify-auth-token.json')
export const SHOPIFY_AUTH_URL_PATH =
  process.env.SHOPIFY_AUTH_URL_PATH?.trim() || path.join(os.tmpdir(), 'shopify-auth-url.txt')

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

export function resolveFromScript(...segments) {
  return path.join(SCRIPT_DIR, ...segments)
}

export function getShopifyAccessToken() {
  const explicit = process.env.SHOPIFY_ACCESS_TOKEN?.trim()
  if (explicit) return explicit

  if (!fs.existsSync(SHOPIFY_TOKEN_PATH)) {
    throw new Error(
      `Shopify auth token not found. Set SHOPIFY_ACCESS_TOKEN or run: node scripts/shopify-pkce-auth.mjs (token path: ${SHOPIFY_TOKEN_PATH})`
    )
  }

  const token = JSON.parse(fs.readFileSync(SHOPIFY_TOKEN_PATH, 'utf8'))
  const accessToken = token.access_token?.trim()
  if (!accessToken) {
    throw new Error(`Shopify token file is missing access_token: ${SHOPIFY_TOKEN_PATH}`)
  }

  return accessToken
}

export async function gql(query, variables = {}) {
  const response = await fetch(SHOPIFY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': getShopifyAccessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })

  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  if (!response.ok || json?.errors) {
    throw new Error(
      JSON.stringify(
        json?.errors || json || { status: response.status, statusText: response.statusText, body: text },
        null,
        2
      )
    )
  }

  if (!json?.data) {
    throw new Error(`Shopify response missing data: ${text}`)
  }

  return json.data
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]

    if (!raw.startsWith('--')) {
      args._.push(raw)
      continue
    }

    if (raw.startsWith('--no-')) {
      args[raw.slice(5)] = false
      continue
    }

    const equalIndex = raw.indexOf('=')
    if (equalIndex >= 0) {
      args[raw.slice(2, equalIndex)] = raw.slice(equalIndex + 1)
      continue
    }

    const key = raw.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next
      index += 1
      continue
    }

    args[key] = true
  }

  return args
}

export function toBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue
  if (typeof value === 'boolean') return value

  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false

  throw new Error(`Expected a boolean value, received: ${value}`)
}

export function slugifyHandle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function ensureUniqueHandle(candidate, existingHandles) {
  const base = slugifyHandle(candidate) || 'page-copy'
  if (!existingHandles.has(base)) return base

  let counter = 2
  while (existingHandles.has(`${base}-${counter}`)) {
    counter += 1
  }

  return `${base}-${counter}`
}

export function readOptionalBody(args) {
  const inlineBody = typeof args.body === 'string' ? args.body : null
  const bodyFile =
    typeof args['body-file'] === 'string' && args['body-file'].trim()
      ? path.resolve(args['body-file'])
      : null

  if (inlineBody && bodyFile) {
    throw new Error('Use either --body or --body-file, not both')
  }

  if (bodyFile) {
    return fs.readFileSync(bodyFile, 'utf8')
  }

  return inlineBody
}

export function buildPageLocator(args, prefix) {
  const id = typeof args[`${prefix}-id`] === 'string' ? args[`${prefix}-id`].trim() : null
  const handle =
    typeof args[`${prefix}-handle`] === 'string' ? args[`${prefix}-handle`].trim() : null
  const title = typeof args[`${prefix}-title`] === 'string' ? args[`${prefix}-title`].trim() : null

  const provided = [id, handle, title].filter(Boolean)
  if (provided.length !== 1) {
    throw new Error(`Provide exactly one of --${prefix}-id, --${prefix}-handle, or --${prefix}-title`)
  }

  return { id, handle, title }
}

export function describePageLocator(locator) {
  if (locator.id) return `id=${locator.id}`
  if (locator.handle) return `handle=${locator.handle}`
  return `title=${locator.title}`
}

export async function listShopifyPages() {
  const data = await gql(`{
    shop { primaryDomain { url } }
    pages(first: 250) {
      nodes {
        id
        title
        handle
        isPublished
        templateSuffix
        updatedAt
      }
    }
  }`)

  return {
    primaryDomainUrl: data.shop?.primaryDomain?.url || null,
    pages: data.pages?.nodes || [],
  }
}

export function resolveShopifyPage(pages, locator) {
  if (locator.id) {
    const page = pages.find((candidate) => candidate.id === locator.id)
    if (!page) {
      throw new Error(`No Shopify page found for ${describePageLocator(locator)}`)
    }
    return page
  }

  const matches = pages.filter((candidate) => {
    if (locator.handle) return candidate.handle === locator.handle
    return candidate.title.trim().toLowerCase() === locator.title.trim().toLowerCase()
  })

  if (matches.length === 0) {
    throw new Error(`No Shopify page found for ${describePageLocator(locator)}`)
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple Shopify pages matched ${describePageLocator(locator)}: ${matches
        .map((page) => `${page.title} (${page.handle})`)
        .join(', ')}`
    )
  }

  return matches[0]
}

export async function fetchShopifyPage(id) {
  const data = await gql(
    `query pageDetails($id: ID!) {
      page(id: $id) {
        id
        title
        handle
        body
        isPublished
        templateSuffix
        updatedAt
      }
    }`,
    { id }
  )

  if (!data.page) {
    throw new Error(`Shopify page not found for id=${id}`)
  }

  return data.page
}

export function buildShopifyPageUrl(primaryDomainUrl, handle) {
  if (!primaryDomainUrl?.trim() || !handle?.trim()) return null
  return new URL(`/pages/${handle.trim()}`, primaryDomainUrl).toString()
}
