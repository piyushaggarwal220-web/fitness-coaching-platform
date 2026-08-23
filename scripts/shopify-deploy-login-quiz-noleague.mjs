import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const LOGIN_URL = 'https://app.lurvox.in/login'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`get ${key}: ${res.status} ${await res.text()}`)
  return (await res.json()).asset.value
}

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`put ${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

const files = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['sections/lurvox-client-login.liquid', 'scripts/shopify-assets/sections-lurvox-client-login.liquid'],
  ['snippets/lurvox-header-match.liquid', 'scripts/shopify-assets/snippets-lurvox-header-match.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
]

for (const [key, rel] of files) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const hg = JSON.parse(await get('sections/header-group.json'))
hg.sections.lurvox_client_login = {
  type: 'lurvox-client-login',
  settings: {
    enabled: true,
    homepage_only: false,
    prompt: 'Already training with LURVOX?',
    label: 'Existing client? Log in',
    login_url: LOGIN_URL,
    accent_color: '#FF6200',
  },
}
hg.order = (hg.order || []).filter((id) => id !== 'lurvox_client_login')
const afterIdx = hg.order.findIndex((id) => {
  const t = hg.sections[id]?.type || ''
  return /announcement|offer/i.test(t) || /announcement|offer/i.test(id)
})
hg.order.splice(afterIdx >= 0 ? afterIdx + 1 : 0, 0, 'lurvox_client_login')
await put('sections/header-group.json', `${JSON.stringify(hg, null, 2)}\n`)
console.log('header order', hg.order)

for (const key of ['sections/lurvox-offer-home.liquid', 'sections/lurvox-offer-strip.liquid']) {
  let src
  try {
    src = await get(key)
  } catch {
    console.log('missing', key)
    continue
  }
  const before = src
  src = src.replace(
    /\.lurvox-client-login\s*,\s*aside\.lurvox-client-login\s*,\s*\.shopify-section-group-header-group\s+\.lurvox-client-login\s*\{\s*display:\s*none\s*!important;\s*\}/g,
    '/* lurvox: keep client login visible */'
  )
  src = src.replace(
    /\.lurvox-client-login[\s\S]{0,80}?\{\s*display:\s*none\s*!important;\s*\}/g,
    '/* lurvox: keep client login visible */'
  )
  if (src !== before) await put(key, src)
  else console.log('no hide rule in', key)
}

for (const key of [
  'templates/index.json',
  'templates/page.compare-plans.json',
  'templates/page.json',
]) {
  let raw
  try {
    raw = await get(key)
  } catch {
    console.log('skip', key)
    continue
  }
  if (!/Consistency League|Crazy League/i.test(raw)) {
    console.log('no league copy in', key)
    continue
  }
  const next = raw
    .replace(/Consistency League entry/gi, 'Weekly coach phone call')
    .replace(/Crazy League \+ ₹5,000 prize/gi, 'Weekly coach phone call')
    .replace(/,?\s*Consistency League/gi, '')
    .replace(/Consistency League[^.]*\.?/gi, '')
  if (next !== raw) await put(key, next)
}

console.log('live', `https://www.lurvox.in/?v=loginquiz${Date.now()}`)
console.log('quiz', 'https://www.lurvox.in/pages/find-your-plan')
