import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const res = await fetch(
  `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent('snippets/lurvox-header-match.liquid')}`,
  { headers }
)
const snip = (await res.json()).asset.value
console.log('snippet has script', snip.includes('lx-header-login'))
console.log('snippet has force visible', snip.includes('lurvox-client-login-force') || snip.includes('keep client login'))

const layoutRes = await fetch(
  `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}`,
  { headers }
)
const layout = (await layoutRes.json()).asset.value
const idx = layout.indexOf('lurvox-header-match')
console.log('layout snippet around include', layout.slice(Math.max(0, idx - 80), idx + 120))
console.log('layout itself has lx-header-login', layout.includes('lx-header-login'))
