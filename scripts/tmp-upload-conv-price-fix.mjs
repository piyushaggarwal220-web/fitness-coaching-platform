import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]
const liquid = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)

for (const themeId of themes) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      asset: { key: 'snippets/lurvox-conversion-boost.liquid', value: liquid },
    }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json).slice(0, 300))
  console.log('updated conversion-boost on', themeId)
}

console.log('done')
