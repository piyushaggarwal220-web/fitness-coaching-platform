import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const THEME_ID = '161375289595'
const THEME_GID = `gid://shopify/OnlineStoreTheme/${THEME_ID}`
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const themeDir = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
const keys = [
  'sections/lurvox-client-login.liquid',
  'sections/lurvox-social-proof.liquid',
  'sections/header-group.json',
  'snippets/header-drawer.liquid',
  'blocks/_header-logo.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'templates/index.json',
  'locales/en.default.json',
]

const themeResponse = await fetch(GQL, {
  method: 'POST',
  headers: {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `{ themes(first: 50) { nodes { id name role } } }`,
  }),
})
const themeResult = await themeResponse.json()
const target = themeResult.data?.themes?.nodes?.find((theme) => theme.id === THEME_GID)
if (!target) throw new Error('New changes theme not found')
if (target.role === 'MAIN') throw new Error('Refusing to modify the live MAIN theme')
if (target.name.toLowerCase() !== 'new changes') {
  throw new Error(`Unexpected theme name: ${target.name}`)
}

for (const key of keys) {
  const value = fs.readFileSync(path.join(themeDir, key), 'utf8')
  const response = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const result = await response.json()
  if (!response.ok || result.errors) {
    throw new Error(`${key}: ${JSON.stringify(result)}`)
  }
  console.log(`Updated ${key}`)
}

for (const key of keys) {
  const expected = fs.readFileSync(path.join(themeDir, key), 'utf8')
  const response = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const result = await response.json()
  const actual = result.asset?.value
  const matches = key.endsWith('.json')
    ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected))
    : actual === expected
  if (!response.ok || !matches) {
    throw new Error(`Verification failed for ${key}`)
  }
}

console.log(
  JSON.stringify({
    ok: true,
    theme: target,
    updated: keys,
    previewUrl: `https://www.lurvox.in/?preview_theme_id=${THEME_ID}`,
  })
)
