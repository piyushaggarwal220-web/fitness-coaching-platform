/**
 * Draft: match navbar to black + #ff6200 theme.
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

const snippet = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-header-match.liquid'),
  'utf8'
)
await put('snippets/lurvox-header-match.liquid', snippet)

let themeLiq = await get('layout/theme.liquid')
const renderTag = "{% render 'lurvox-header-match' %}"
if (!themeLiq.includes('lurvox-header-match')) {
  if (themeLiq.includes('</head>')) {
    themeLiq = themeLiq.replace('</head>', `  ${renderTag}\n</head>`)
  } else if (themeLiq.includes('</body>')) {
    themeLiq = themeLiq.replace('</body>', `  ${renderTag}\n</body>`)
  } else {
    themeLiq += `\n${renderTag}\n`
  }
  await put('layout/theme.liquid', themeLiq)
} else {
  console.log('theme already renders header-match')
}

console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=nav2`)
