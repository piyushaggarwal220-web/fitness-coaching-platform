/**
 * Remove lurvox-layout-talk-wa-v1 script that rewrites talk CTAs to WhatsApp.
 * Draft theme only. Prefer REST PUT after surgical edit.
 */
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

let layout = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

fs.writeFileSync(path.join(process.env.TEMP, 'draft-layout-pre-wa-clean.liquid'), layout)

const marker = 'lurvox-layout-talk-wa-v1'
const idx = layout.indexOf(marker)
if (idx < 0) {
  console.log('marker not found')
  process.exit(0)
}

// Find surrounding <script>...</script>
const scriptStart = layout.lastIndexOf('<script>', idx)
const scriptEnd = layout.indexOf('</script>', idx)
if (scriptStart < 0 || scriptEnd < 0) {
  console.error('script bounds not found', { scriptStart, scriptEnd })
  process.exit(1)
}
const end = scriptEnd + '</script>'.length
console.log('removing script bytes', end - scriptStart)
console.log(layout.slice(scriptStart, Math.min(scriptStart + 200, end)))

layout = layout.slice(0, scriptStart) + '<!-- lurvox-layout-talk-wa-v1 removed: keep consult on-site -->\n' + layout.slice(end)

// sanity
if (!layout.includes('content_for_header') || !layout.includes('content_for_layout')) {
  console.error('sanity failed: missing content_for_*')
  process.exit(1)
}

const put = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
}).then((r) => r.json())
if (put.errors) {
  console.error(put.errors)
  process.exit(1)
}
console.log('REST put ok', put.asset?.key, put.asset?.size)

const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

console.log({
  hasMarker: verify.includes('lurvox-layout-talk-wa-v1'),
  hasWaConsult:
    /wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(verify),
  hasContentForHeader: verify.includes('content_for_header'),
  hasContentForLayout: verify.includes('content_for_layout'),
})
