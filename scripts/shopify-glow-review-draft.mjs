/**
 * Install typography glow and comparison-table refinements on the named
 * unpublished review theme only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const API_VERSION = '2025-01'
const GQL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
const REST = `https://${STORE}/admin/api/${API_VERSION}`
const REVIEW_NAME = 'LURVOX Price Review 1499-2499-3999 2026-07-29'
const DRAFT_NAME = 'LURVOX Comparison Glow + 12M Review 2026-07-29'
const RENDER = "{% render 'lurvox-orange-glow' %}"

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}
const snippet = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-orange-glow.liquid'),
  'utf8'
)
const compareSnippet = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
const compareSection = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-plan-compare.liquid'),
  'utf8'
)

async function gql(query, variables = {}) {
  const response = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function numericThemeId(gid) {
  const match = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!match) throw new Error(`Invalid theme ID: ${gid}`)
  return match[1]
}

async function getAsset(themeId, key) {
  const response = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!response.ok) throw new Error(`GET ${key}: ${response.status}`)
  return (await response.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(`PUT ${key}: ${JSON.stringify(json.errors || json).slice(0, 500)}`)
  }
}

const themes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const source = themes.find((theme) => theme.name === REVIEW_NAME)
if (!source) throw new Error(`Theme not found: ${REVIEW_NAME}`)

let review = source
if (source.role === 'MAIN') {
  review = themes.find((theme) => theme.name === DRAFT_NAME && theme.role !== 'MAIN')
  if (!review) {
    const duplicate = await gql(
      `mutation DuplicateTheme($id: ID!, $name: String) {
        themeDuplicate(id: $id, name: $name) {
          newTheme { id name role }
          userErrors { field message }
        }
      }`,
      { id: source.id, name: DRAFT_NAME }
    )
    if (duplicate.themeDuplicate.userErrors?.length) {
      throw new Error(JSON.stringify(duplicate.themeDuplicate.userErrors, null, 2))
    }
    review = duplicate.themeDuplicate.newTheme
  }
}
if (!review?.id || review.role === 'MAIN') {
  throw new Error('Safe unpublished review theme was not available')
}

const themeId = numericThemeId(review.id)
const layoutKey = 'layout/theme.liquid'
let layout = ''
for (let attempt = 1; attempt <= 20; attempt += 1) {
  try {
    layout = await getAsset(themeId, layoutKey)
    if (layout) break
  } catch {
    // Shopify copies duplicated theme assets asynchronously.
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))
}
if (!layout.includes('{{ content_for_header }}') || !layout.includes('</head>')) {
  throw new Error('Theme layout is missing required header markers')
}

layout = layout.replace(
  /\s*\{%\s*render\s+['"]lurvox-orange-glow['"]\s*%\}\s*/g,
  '\n'
)
layout = layout.replace('</head>', `  ${RENDER}\n</head>`)

await putAsset(themeId, 'snippets/lurvox-orange-glow.liquid', snippet)
await putAsset(themeId, 'snippets/lurvox-plan-compare-inline.liquid', compareSnippet)
await putAsset(themeId, 'sections/lurvox-plan-compare.liquid', compareSection)
await putAsset(themeId, layoutKey, layout)

const verifiedLayout = await getAsset(themeId, layoutKey)
const verifiedSnippet = await getAsset(themeId, 'snippets/lurvox-orange-glow.liquid')
const verifiedCompare = await getAsset(
  themeId,
  'snippets/lurvox-plan-compare-inline.liquid'
)
const renderInstalled = /{%-?\s*render\s+['"]lurvox-orange-glow['"]\s*-?%}/.test(
  verifiedLayout
)
if (!renderInstalled) {
  throw new Error('Glow snippet uploaded, but its layout render did not persist')
}
console.log(
  JSON.stringify(
    {
      ok: true,
      published: false,
      theme: review,
      previewUrl: `https://www.lurvox.in/?preview_theme_id=${themeId}&glow=1`,
      renderInstalled,
      glowInstalled: verifiedSnippet.includes('--lx-text-glow-soft'),
      comparisonGlowInstalled: verifiedCompare.includes('0 0 38px'),
      twelveMonthExclusiveInstalled: verifiedCompare.includes(
        'Quarterly 1:1 transformation strategy call'
      ),
    },
    null,
    2
  )
)
