import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const res = await fetch(
  `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent('blocks/ai_gen_block_cd3c949.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
const v = (await res.json()).asset.value
fs.writeFileSync('scripts/tmp-live-cd3c949.liquid', v)
console.log('len', v.length)
console.log('carousel', v.includes('carousel'))
console.log('track', v.includes('track') || v.includes('slider'))
console.log('Real people in file', v.includes('Real people'))
const bad = v.match(/class="[^"]*Real[^"]*"/g)
console.log('bad classes', bad)
console.log('image settings refs', (v.match(/transformation_image_/g) || []).length)
// find custom element render structure
const idx = v.indexOf('<client-results')
console.log('client-results tag idx', idx)
console.log(v.slice(Math.max(0, v.indexOf('ai-client-results')), Math.max(0, v.indexOf('ai-client-results')) + 800))
