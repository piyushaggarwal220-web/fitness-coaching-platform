/**
 * Live MAIN theme: one-a-day physique preview under the plan cards.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

loadEnvLocal()

const tokenFile = fs.existsSync(tokenPath)
  ? JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
  : null

let token = process.env.SHOPIFY_ACCESS_TOKEN || tokenFile?.access_token || ''

if (!token && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
  const minted = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const mintedJson = await minted.json().catch(() => ({}))
  if (!minted.ok || !mintedJson.access_token) {
    console.error('Shopify client credentials failed', minted.status)
    process.exit(1)
  }
  token = mintedJson.access_token
}

if (!token && tokenFile?.refresh_token) {
  const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (refresh.ok) {
    Object.assign(tokenFile, JSON.parse(await refresh.text()))
    fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
    token = tokenFile.access_token
  }
}

if (!token) {
  const missing = ['SHOPIFY_SHOP', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'].filter((key) => !process.env[key])
  console.error('Missing Shopify token at', tokenPath)
  if (missing.length) console.error('Also missing env:', missing.join(', '))
  console.error('Run: node scripts/shopify-pkce-auth.mjs')
  process.exit(1)
}
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themesRes = await fetch(`${REST}/themes.json`, { headers: H })
const themesJson = await themesRes.json().catch(() => ({}))
const themes = themesJson.themes ?? []
const main = themes.find((t) => t.role === 'main')
if (!main) {
  const detail = themesJson.errors || themesJson.error || themesRes.status
  throw new Error(`No main theme (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`)
}
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: H }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

let whatYouGet = await get('snippets/lurvox-what-you-get.liquid')
if (!whatYouGet) throw new Error('Live what-you-get snippet is missing')
const before = whatYouGet
whatYouGet = whatYouGet.replace(/\r?\n[ \t]*\{% render 'lurvox-physique-preview' %\}/g, '')
if (before === whatYouGet) {
  console.log('preview render already absent on live theme')
} else {
  console.log('removed preview render from live what-you-get')
}

let layout = await get('layout/theme.liquid')
if (!layout) throw new Error('layout/theme.liquid missing')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  { filename: 'snippets/lurvox-what-you-get.liquid', body: { type: 'TEXT', value: whatYouGet } },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const res = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${main.id}`,
      files,
    },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log(
  'upserted',
  json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename)
)
