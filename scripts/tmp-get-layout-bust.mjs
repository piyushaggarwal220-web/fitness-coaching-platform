import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const res = await fetch(
  `https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/161454620923/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
const layout = (await res.json()).asset.value
console.log('api busts', layout.match(/lurvox-cache-bust[^<]*/g))
console.log('has header login', layout.includes('lx-header-existing-login'))
console.log('updated_at would be in asset meta')

const meta = await fetch(
  'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/161454620923/assets.json',
  { headers: { 'X-Shopify-Access-Token': token } }
)
const assets = (await meta.json()).assets || []
const themeLiq = assets.find((a) => a.key === 'layout/theme.liquid')
console.log('layout meta', themeLiq)
const finder = assets.find((a) => a.key === 'sections/lurvox-plan-finder.liquid')
console.log('finder meta', finder)
