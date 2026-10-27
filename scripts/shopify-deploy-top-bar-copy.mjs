/**
 * Replace the live homepage discount strip with the brand line.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOP = '9uwyq1-0j.myshopify.com'
const REST = `https://${SHOP}/admin/api/2025-01`
const GQL = `${REST}/graphql.json`
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const headline = "India's best human fitness coaching"

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

const tokenFile = fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')) : {}
const headers = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN || tokenFile.access_token || '',
  'Content-Type': 'application/json',
}

async function refreshUserToken() {
  if (!tokenFile.refresh_token) return false
  const refresh = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: tokenFile.refresh_token,
    }),
  })
  if (!refresh.ok) return false
  Object.assign(tokenFile, await refresh.json())
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  headers['X-Shopify-Access-Token'] = tokenFile.access_token
  return true
}

async function mintClientCredentials() {
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) return false
  const minted = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  })
  const mintedJson = await minted.json().catch(() => ({}))
  if (!minted.ok || !mintedJson.access_token) return false
  headers['X-Shopify-Access-Token'] = mintedJson.access_token
  return true
}

async function themesJson() {
  return fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] } })
}

let themeRes = await themesJson()
if (themeRes.status === 401) {
  if (await refreshUserToken()) themeRes = await themesJson()
}
if (themeRes.status === 401) {
  if (await mintClientCredentials()) themeRes = await themesJson()
}

const themeJson = await themeRes.json()
if (!themeRes.ok || !Array.isArray(themeJson.themes)) {
  throw new Error(`themes.json ${themeRes.status}`)
}
const main = themeJson.themes.find((t) => t.role === 'main')
if (!main) throw new Error('No main theme')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': headers['X-Shopify-Access-Token'] } }
  )
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset.value
}

let index = await get('templates/index.json')
const data = JSON.parse(index)
const offer =
  data.sections?.lurvox_offer_home ||
  Object.values(data.sections || {}).find((section) => section?.type === 'lurvox-offer-home')
if (offer?.settings) {
  offer.settings.headline = headline
  offer.settings.enabled = true
}
index = JSON.stringify(data)

let layout = await get('layout/theme.liquid')
const stamp = Date.now()
layout = /<!-- lurvox-cache-bust \d+ -->/.test(layout)
  ? layout.replace(/<!-- lurvox-cache-bust \d+ -->/, `<!-- lurvox-cache-bust ${stamp} -->`)
  : layout.replace('</head>', `<!-- lurvox-cache-bust ${stamp} -->\n</head>`)

const files = [
  {
    filename: 'sections/lurvox-offer-home.liquid',
    body: {
      type: 'TEXT',
      value: fs.readFileSync(path.join(ROOT, 'scripts', 'shopify-assets', 'sections-lurvox-offer-home.liquid'), 'utf8'),
    },
  },
  { filename: 'templates/index.json', body: { type: 'TEXT', value: index } },
  { filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } },
]

const res = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: { themeId: `gid://shopify/OnlineStoreTheme/${main.id}`, files },
  }),
})
const json = await res.json()
if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
if (json.data.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(json.data.themeFilesUpsert.userErrors, null, 2))
}
console.log('upserted', json.data.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('home', `https://www.lurvox.in/?v=${stamp}`)
