import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const token =
  process.env.SHOPIFY_ACCESS_TOKEN ||
  (fs.existsSync(tokenPath) ? JSON.parse(fs.readFileSync(tokenPath, 'utf8')).access_token : null)
if (!token) {
  console.error('Missing Shopify token')
  process.exit(1)
}

const themeRes = await fetch(`${REST}/themes.json`, { headers: { 'X-Shopify-Access-Token': token } })
const themeJson = await themeRes.json()
const main = themeJson.themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const keys = [
  'templates/index.json',
  'sections/header-group.json',
  'sections/footer-group.json',
  'sections/lurvox-header-redesign.liquid',
  'sections/footer.liquid',
  'blocks/ai_gen_block_361650c.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'snippets/header-drawer.liquid',
]

for (const key of keys) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  console.log(key, res.status, res.ok ? (await res.json()).asset?.value?.length : await res.text())
}
