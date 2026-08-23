/**
 * Mobile polish upload to draft theme 161454620923
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const files = [
  ['blocks/ai_gen_block_52353f6.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_52353f6.liquid'],
  ['blocks/ai_gen_block_361650c.liquid', 'scripts/shopify-assets/blocks-ai_gen_block_361650c.liquid'],
  ['snippets/lurvox-home-flow.liquid', 'scripts/shopify-assets/snippets-lurvox-home-flow.liquid'],
  ['snippets/lurvox-what-you-get.liquid', 'scripts/shopify-assets/snippets-lurvox-what-you-get.liquid'],
  ['snippets/lurvox-sales-closer.liquid', 'scripts/shopify-assets/snippets-lurvox-sales-closer.liquid'],
]

for (const [key, rel] of files) {
  const value = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) {
    console.error(key, await res.text())
    process.exit(1)
  }
  console.log('uploaded', key)
}

console.log('preview', `https://www.lurvox.in/?preview_theme_id=${THEME_ID}&v=mobile2`)
