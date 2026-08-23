import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const MAIN = 161429127419

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${MAIN}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

async function put(key, value) {
  const res = await fetch(`${REST}/themes/${MAIN}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 300)}`)
  console.log('updated', key, 'bytes', value.length)
}

const liquid = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'),
  'utf8'
)
// Strip doc tag; custom-liquid blocks don't allow {% stylesheet %}
const body = liquid
  .replace(/^\{%\s*doc\s*%\}[\s\S]*?\{%\s*enddoc\s*%\}\s*/i, '')
  .replace(/\{%\s*stylesheet\s*%\}/gi, '<style>')
  .replace(/\{%\s*endstylesheet\s*%\}/gi, '</style>')

const index = JSON.parse(await get('templates/index.json'))
let found = false
for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (
      block?.type === 'custom-liquid' &&
      typeof block.settings?.custom_liquid === 'string' &&
      /plan-compare-inline/.test(block.settings.custom_liquid)
    ) {
      block.settings.custom_liquid = `{% comment %}inline matrix ${Date.now()}{% endcomment %}\n${body}`
      found = true
    }
  }
}
if (!found) throw new Error('compare inline block not found')
await put('templates/index.json', JSON.stringify(index))

await new Promise((r) => setTimeout(r, 5000))
const html = await (
  await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
    headers: { 'User-Agent': `inline/${Date.now()}` },
  })
).text()
console.log({
  old2699: /₹\s*2,?699/.test(html),
  prices: (html.match(/<strong>₹[^<]+<\/strong>/g) || []).slice(0, 6),
  len: html.length,
})
