/**
 * Fix plan-card radio "circle under circle" on a THEME COPY only.
 *
 * Root cause: lurvox-equal-plan-shine forced ::after to `transform: scale(1)`
 * and dropped `translate(-50%, -50%)`, so the filled dot sits offset under the
 * outer ring on every plan card.
 *
 * Does NOT touch the live (main) theme.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const BLOCK_KEY = 'blocks/ai_gen_block_361650c.liquid'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const BAD =
  `.ai-transformation-plan-card-{{ ai_gen_id }} .ai-transformation-plan-radio-{{ ai_gen_id }}::after {
    content: '' !important;
    opacity: 1 !important;
    transform: scale(1) !important;
    background: {{ block.settings.accent_color }} !important;
  }`

const GOOD =
  `.ai-transformation-plan-card-{{ ai_gen_id }} .ai-transformation-plan-radio-{{ ai_gen_id }}::after {
    content: '' !important;
    opacity: 1 !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) scale(1) !important;
    background: {{ block.settings.accent_color }} !important;
  }`

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  return (await res.json()).themes
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text.slice(0, 400) }
}

async function createThemeCopy(srcThemeId, name) {
  // Shopify REST: POST /themes.json with role unpublished + src from existing theme
  // Prefer Themes API duplicate via GraphQL themeFilesCopy or REST theme create from source.
  const res = await fetch(`${REST}/themes.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      theme: {
        name,
        role: 'unpublished',
        src: `https://9uwyq1-0j.myshopify.com/admin/themes/${srcThemeId}`,
      },
    }),
  })
  const json = await res.json()
  return { ok: res.ok, status: res.status, theme: json.theme, errors: json.errors || json }
}

const themes = await listThemes()
const live = themes.find((t) => t.role === 'main')
if (!live) throw new Error('No main theme found')

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
const copyName = `LURVOX Plan Radio Fix ${stamp}`

// Prefer duplicating via Admin GraphQL themeDuplicate if REST src fails.
let copy = null
const restCopy = await createThemeCopy(live.id, copyName)

if (restCopy.ok && restCopy.theme?.id) {
  copy = restCopy.theme
} else {
  // GraphQL themeDuplicate
  const gql = await fetch(`https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: `mutation($id: ID!, $name: String!) {
        themeDuplicate(id: $id, name: $name) {
          newTheme { id name role }
          userErrors { field message }
        }
      }`,
      variables: {
        id: `gid://shopify/OnlineStoreTheme/${live.id}`,
        name: copyName,
      },
    }),
  })
  const gqlJson = await gql.json()
  const dup = gqlJson.data?.themeDuplicate
  if (dup?.userErrors?.length) {
    console.error(JSON.stringify({ restCopy, gql: gqlJson }, null, 2))
    process.exit(1)
  }
  const gid = dup?.newTheme?.id || ''
  const id = Number(String(gid).split('/').pop())
  if (!id) {
    console.error(JSON.stringify({ restCopy, gql: gqlJson }, null, 2))
    process.exit(1)
  }
  copy = { id, name: dup.newTheme.name, role: dup.newTheme.role }
}

// Wait briefly for duplicate assets to settle, then patch.
await new Promise((r) => setTimeout(r, 5000))

let original = ''
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    original = await getAsset(copy.id, BLOCK_KEY)
    if (original.includes('ai-transformation-plan-radio')) break
  } catch {
    // Theme duplicate may still be provisioning.
  }
  await new Promise((r) => setTimeout(r, 4000))
}

if (!original.includes('ai-transformation-plan-radio')) {
  console.error(JSON.stringify({ error: 'copy theme block not ready', copy }, null, 2))
  process.exit(1)
}

fs.writeFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-prerestore-ai_gen_block_361650c.liquid',
  original,
  'utf8'
)

const hasBad = original.includes('transform: scale(1) !important;')
const hasGoodAlready = original.includes('transform: translate(-50%, -50%) scale(1) !important;')

let next = original
let action = 'none'
if (hasGoodAlready && !hasBad) {
  action = 'already-fixed'
} else if (original.includes(BAD)) {
  next = original.replace(BAD, GOOD)
  action = 'exact-replace'
} else {
  // Fuzzy: fix any lurvox-equal-plan-shine radio ::after block that lacks translate.
  const fuzzy = next.replace(
    /(\.ai-transformation-plan-card-\{\{ ai_gen_id \}\} \.ai-transformation-plan-radio-\{\{ ai_gen_id \}\}::after \{[\s\S]*?)transform:\s*scale\(1\)\s*!important;/,
    `$1top: 50% !important;\n    left: 50% !important;\n    transform: translate(-50%, -50%) scale(1) !important;`
  )
  if (fuzzy !== next) {
    next = fuzzy
    action = 'fuzzy-replace'
  } else {
    action = 'pattern-not-found'
  }
}

let put = { ok: true, status: 0, skipped: true }
if (action === 'exact-replace' || action === 'fuzzy-replace') {
  put = await putAsset(copy.id, BLOCK_KEY, next)
}

const after = put.ok && !put.skipped ? await getAsset(copy.id, BLOCK_KEY) : original

const previewBase = `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${copy.id}`
const previewCustom = `https://www.lurvox.in/?preview_theme_id=${copy.id}`

console.log(
  JSON.stringify(
    {
      liveTheme: { id: live.id, name: live.name },
      copyTheme: { id: copy.id, name: copy.name, role: copy.role },
      action,
      put: { ok: put.ok, status: put.status },
      beforeHadBadScale: hasBad,
      afterHasCenteredTransform: after.includes('translate(-50%, -50%) scale(1)'),
      afterStillHasNakedScale: /transform:\s*scale\(1\)\s*!important;/.test(after),
      previewUrls: { myshopify: previewBase, customDomain: previewCustom },
    },
    null,
    2
  )
)
