/**
 * CTA cleanup on draft 161429127419:
 * - Remove green sticky WhatsApp + hide FAB
 * - Revamp Start 90-day sticky + hero primary
 * - Polish 3 closer plan CTAs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161429127419
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return (await res.json()).asset?.value ?? null
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`${key}: ${JSON.stringify(json).slice(0, 400)}`)
  console.log('updated', key)
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const theme = themes.find((t) => t.id === THEME_ID)
if (!theme || theme.role === 'main') throw new Error('Refuse MAIN/missing')
console.log('target', theme.name)

const boost = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
const closer = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'snippets-lurvox-sales-closer.liquid'),
  'utf8'
)
const hero = fs.readFileSync(
  path.join(__dirname, 'tmp-offer-copy-draft', 'blocks__ai_gen_block_52353f6.liquid'),
  'utf8'
)
if (!boost.includes('lx-conv-sticky__label')) throw new Error('boost missing sticky revamp')
if (!hero.includes('lurvox-hero-cta-v2')) throw new Error('hero missing cta v2')
if (boost.includes('lx-conv-sticky__wa') || boost.includes('#128c7e')) {
  throw new Error('green WA sticky still present')
}

await putAsset('snippets/lurvox-conversion-boost.liquid', boost)
await putAsset('snippets/lurvox-sales-closer.liquid', closer)
await putAsset('blocks/ai_gen_block_52353f6.liquid', hero)

const footer = JSON.parse(await getAsset('sections/footer-group.json'))
const fabId = Object.keys(footer.sections || {}).find(
  (id) => footer.sections[id]?.type === 'mobile-floating-bar'
)
if (fabId) {
  footer.sections[fabId].settings = {
    ...footer.sections[fabId].settings,
    enabled: false,
  }
  await putAsset('sections/footer-group.json', JSON.stringify(footer, null, 2))
  console.log('fab disabled', fabId)
}

console.log(
  JSON.stringify(
    {
      preview: `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=cta-clean`,
      published: false,
    },
    null,
    2
  )
)
