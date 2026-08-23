import fs from 'node:fs'
import path from 'node:path'

const store = '9uwyq1-0j.myshopify.com'
const api = `https://${store}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
}

const themesResponse = await fetch(`${api}/themes.json`, { headers })
const themes = (await themesResponse.json()).themes ?? []
const main = themes.find((theme) => theme.role === 'main')
if (!main) throw new Error('No live Shopify theme found')

const key = 'blocks/ai_gen_block_361650c.liquid'
const value = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme', key),
  'utf8'
)

const uploadResponse = await fetch(`${api}/themes/${main.id}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key, value } }),
})
const uploadResult = await uploadResponse.json()
if (!uploadResponse.ok || uploadResult.errors) {
  throw new Error(JSON.stringify(uploadResult))
}

const verifyResponse = await fetch(
  `${api}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers }
)
const verifyResult = await verifyResponse.json()
const remote = verifyResult.asset?.value ?? ''
if (!remote.includes('border: 2px solid #ffffff !important;')) {
  throw new Error('White selected-plan outline was not found after upload')
}

console.log(
  JSON.stringify({
    ok: true,
    theme: { id: main.id, name: main.name, role: main.role },
    updated: key,
  })
)
