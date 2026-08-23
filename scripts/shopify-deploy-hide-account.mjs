import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
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
      asset: { key, value: fs.readFileSync(path.join(ROOT, rel), 'utf8') },
    }),
  })
  if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

await put('snippets/lurvox-header-match.liquid', 'scripts/shopify-assets/snippets-lurvox-header-match.liquid')
console.log('live', `https://www.lurvox.in/?v=noaccount${Date.now()}`)
