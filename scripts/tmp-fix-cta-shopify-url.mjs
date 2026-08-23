import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const indexAsset = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())

const index = JSON.parse(indexAsset.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
const s = index.sections.blocks_C9E4qf.blocks[wygKey].settings
console.log('remote settings', {
  cta_url: s.cta_url,
  cta_label: s.cta_label,
  flat_list: s.flat_list,
  highlight_text: s.highlight_text?.slice(0, 80),
  paragraph: s.paragraph,
})

// Try shopify://pages/{id} format
s.cta_url = 'shopify://pages/134115393787'
s.cta_label = 'See the Consistency League →'

await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': token.access_token,
  },
  body: JSON.stringify({
    asset: { key: 'templates/index.json', value: JSON.stringify(index, null, 2) },
  }),
})

const again = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`,
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const index2 = JSON.parse(again.asset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const s2 = index2.sections.blocks_C9E4qf.blocks[wygKey].settings
console.log('after shopify:// put', { cta_url: s2.cta_url, cta_label: s2.cta_label })
