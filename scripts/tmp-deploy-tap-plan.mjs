import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const THEME_ID = '161375289595'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function put(key, value) {
  const r = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 400)}`)
  console.log('updated', key)
}

const root = path.join(process.cwd(), 'scripts', 'tmp-new-changes-theme')
await put(
  'blocks/ai_gen_block_361650c.liquid',
  fs.readFileSync(path.join(root, 'blocks', 'ai_gen_block_361650c.liquid'), 'utf8')
)
await put(
  'templates/index.json',
  fs.readFileSync(path.join(root, 'templates', 'index.json'), 'utf8')
)

await new Promise((r) => setTimeout(r, 3000))
const html = await (
  await fetch(`https://www.lurvox.in/?tap=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
      'Cache-Control': 'no-cache',
    },
  })
).text()

console.log(
  JSON.stringify(
    {
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
      hasAddToCartButton: /ADD TO CART/i.test(html),
      hasCtaButton: /data-cta-button/.test(html),
      hasTapNavigate: html.includes('window.location.href = link'),
      cardCount: [...html.matchAll(/data-plan-index="/g)].length,
    },
    null,
    2
  )
)
