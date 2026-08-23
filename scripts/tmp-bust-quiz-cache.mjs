import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function put(key, rel) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      asset: {
        key,
        value: fs.readFileSync(path.join(ROOT, rel), 'utf8'),
      },
    }),
  })
  if (!res.ok) throw new Error(`${key} ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

await put(
  'sections/lurvox-plan-finder.liquid',
  'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'
)
await put(
  'templates/page.find-your-plan.json',
  'scripts/shopify-assets/templates-page.find-your-plan.json'
)

await new Promise((r) => setTimeout(r, 4000))
const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?v=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache' },
  })
).text()
console.log({
  ghar: /ghar[-\s]?ka[-\s]?khana/i.test(html),
  homeCooked: /Home cooked food\. Keep it simple/.test(html),
  bust: html.includes('cache-bust 1786438000001'),
})
