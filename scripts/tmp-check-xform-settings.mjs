import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const res = await fetch(
  `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent('templates/index.json')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const index = JSON.parse((await res.json()).asset.value)
const b = index.sections.home_blocks_v2.blocks.ai_gen_block_cd3c949_6mqWVi
const s = b.settings || {}
const imgs = []
for (let i = 1; i <= 25; i++) {
  const v = s[`transformation_image_${i}`]
  if (v) imgs.push({ i, v: String(v).slice(0, 80) })
}
console.log('image count', imgs.length)
console.log(imgs.slice(0, 8))
console.log('subheadline', JSON.stringify(s.subheadline || s.client_results_subheadline || s.subtitle))
console.log('headline', s.headline || s.heading)
console.log('disabled', b.disabled)
// all setting keys that look empty image
const empty = []
for (let i = 1; i <= 10; i++) {
  empty.push([i, s[`transformation_image_${i}`] || null])
}
console.log('first10', empty)
