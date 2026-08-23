import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const live = themes.themes.find((t) => t.role === 'main')
const key = 'blocks/ai_gen_block_361650c.liquid'
const res = await fetch(
  `${REST}/themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
  { headers }
)
const val = (await res.json()).asset.value
const out = path.join('scripts', 'tmp-live-plan-block-361650c.liquid')
fs.writeFileSync(out, val)
console.log(
  JSON.stringify(
    {
      themeId: live.id,
      name: live.name,
      bytes: val.length,
      hasMobile: val.includes('lurvox-mobile-plan-cards'),
      rupeeCount: (val.match(/₹/g) || []).length,
      priceMarkup: val.match(/card-original-price[\s\S]{0,220}card-monthly[\s\S]{0,120}/)?.[0]?.slice(0, 300),
      mobileCss: val.match(/lurvox-mobile-plan-cards-v1[\s\S]*?\/lurvox-mobile-plan-cards-v1/)?.[0]?.slice(0, 800),
    },
    null,
    2
  )
)
