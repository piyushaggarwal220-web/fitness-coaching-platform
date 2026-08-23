/**
 * Patch draft offer-strip + header match to pure black + #ff6200.
 */
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

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`get ${key}: ${res.status}`)
  return json.asset.value
}

let login = await get('sections/lurvox-client-login.liquid')
const bgRe =
  /background:\s*[\s\S]*?linear-gradient\(105deg,[^)]+\)\s*!important;/
if (!bgRe.test(login)) {
  console.log('bg pattern miss')
  const i = login.indexOf('.lurvox-offer-strip {')
  console.log(login.slice(i, i + 500))
  process.exit(1)
}
login = login.replace(
  bgRe,
  `background: #050505 !important;
    background-image: radial-gradient(ellipse 80% 140% at 50% -50%, rgba(255, 98, 0, 0.22), transparent 62%) !important;`
)
await put('sections/lurvox-client-login.liquid', login)

const snippet = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-header-match.liquid'),
  'utf8'
)
await put('snippets/lurvox-header-match.liquid', snippet)

console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=nav4`)
