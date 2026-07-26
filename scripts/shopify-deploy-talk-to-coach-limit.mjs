/**
 * Installs the Talk to a coach lifetime submission guard on the live theme.
 *
 * Requires a Shopify auth token at $TEMP/shopify-auth-token.json.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2026-04`
const tokenPath = path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json')
const assetPath = path.join(process.cwd(), 'scripts/shopify-talk-to-coach-limit.js')
const assetKey = 'assets/lurvox-consultation-limit.js'
const layoutKey = 'layout/theme.liquid'
const marker = 'lurvox-consultation-limit-v1'

if (!fs.existsSync(tokenPath)) {
  throw new Error(`Missing Shopify token at ${tokenPath}`)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function shopify(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers } })
  const body = await response.json()
  if (!response.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body))
  }
  return body
}

async function getAsset(themeId, key) {
  const body = await shopify(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`
  )
  return body.asset?.value ?? null
}

async function putAsset(themeId, key, value) {
  await shopify(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } }),
  })
  console.log(`Uploaded ${key}`)
}

const themes = await shopify(`${REST}/themes.json`)
const live = themes.themes.find((theme) => theme.role === 'main')
if (!live) throw new Error('No live Shopify theme found')

const script = fs.readFileSync(assetPath, 'utf8')
await putAsset(live.id, assetKey, script)

let layout = await getAsset(live.id, layoutKey)
if (!layout) throw new Error(`${layoutKey} was not found`)

const injection = `{%- comment -%} ${marker} {%- endcomment -%}
<script src="{{ 'lurvox-consultation-limit.js' | asset_url }}" defer></script>`
const existing = new RegExp(
  `\\s*\\{%- comment -%\\}\\s*${marker}\\s*\\{%- endcomment -%\\}\\s*<script[^>]*lurvox-consultation-limit\\.js[^>]*><\\/script>`,
  'g'
)
layout = layout.replace(existing, '')

if (!layout.includes('</body>')) throw new Error(`${layoutKey} has no closing body tag`)
layout = layout.replace('</body>', `${injection}\n</body>`)
await putAsset(live.id, layoutKey, layout)

console.log(`Installed ${marker} on live theme ${live.id}`)
