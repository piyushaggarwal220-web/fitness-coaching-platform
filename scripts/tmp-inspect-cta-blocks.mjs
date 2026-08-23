import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

const get = async (key) => {
  const json = await fetch(`${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers: { 'X-Shopify-Access-Token': token },
  }).then((r) => r.json())
  return json.asset?.value ?? null
}

const index = JSON.parse((await get('templates/index.json')).replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const blocks = index.sections.blocks_C9E4qf.blocks
for (const [key, block] of Object.entries(blocks)) {
  if (key.startsWith('ai_gen_block_8d967d7')) {
    console.log('=== ', key, 'type:', block.type)
    console.log(JSON.stringify(block.settings, null, 2))
  }
}
console.log('\nblock order:', JSON.stringify(index.sections.blocks_C9E4qf.block_order, null, 2))

const listing = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  headers: { 'X-Shopify-Access-Token': token },
}).then((r) => r.json())
const names = listing.assets.map((a) => a.key)
console.log('\nfab/floating assets:', names.filter((n) => /float|fab|consult/i.test(n)))
console.log('8d967d7 assets:', names.filter((n) => n.includes('8d967d7')))
console.log('361650c assets:', names.filter((n) => n.includes('361650c')))
console.log('header assets:', names.filter((n) => /header/i.test(n)))
