/**
 * Unhide + refresh existing-client login under discount header (live MAIN).
 */
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

// 1) Fresh login section styles
await put(
  'sections/lurvox-client-login.liquid',
  fs.readFileSync(
    path.join(ROOT, 'scripts/shopify-assets/sections-lurvox-client-login.liquid'),
    'utf8'
  )
)

// 2) Ensure header-group has login enabled, right after announcements / offer
const hg = JSON.parse(await get('sections/header-group.json'))
hg.sections.lurvox_client_login = {
  type: 'lurvox-client-login',
  settings: {
    enabled: true,
    homepage_only: true,
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

// 3) Remove CSS that hides client login (in offer sections)
for (const key of [
  'sections/lurvox-offer-home.liquid',
  'sections/lurvox-offer-strip.liquid',
]) {
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
    '/* lurvox: keep client login visible under discount */'
  )
  src = src.replace(
    /\.lurvox-client-login[\s\S]{0,80}?\{\s*display:\s*none\s*!important;\s*\}/g,
    '/* lurvox: keep client login visible under discount */'
  )
  if (src !== before) {
    await put(key, src)
  } else {
    console.log('no hide rule in', key)
  }
}

// 4) Safety: override hide from header-match if present
try {
  let match = await get('snippets/lurvox-header-match.liquid')
  if (/lurvox-client-login[\s\S]{0,60}display:\s*none/.test(match)) {
    match = match.replace(
      /\.lurvox-client-login[\s\S]{0,80}?\{\s*display:\s*none\s*!important;\s*\}/g,
      '/* lurvox: keep client login visible */'
    )
    await put('snippets/lurvox-header-match.liquid', match)
  } else {
    // Force-visible rule at end
    if (!match.includes('/* lurvox-client-login-force-visible */')) {
      match += `

<style id="lx-client-login-force">
  /* lurvox-client-login-force-visible */
  .lurvox-client-login,
  aside.lurvox-client-login,
  .shopify-section-group-header-group .lurvox-client-login {
    display: block !important;
  }
</style>
`
      await put('snippets/lurvox-header-match.liquid', match)
    }
  }
} catch (e) {
  console.log('header-match skip', e.message)
}

console.log('live', `https://www.lurvox.in/?v=clientlogin${Date.now()}`)
