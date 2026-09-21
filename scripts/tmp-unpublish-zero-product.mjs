import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
  .access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const list = await fetch(`https://${STORE}/admin/api/2025-01/products.json?limit=10`, {
  headers: { 'X-Shopify-Access-Token': token },
})
const products = (await list.json()).products || []
console.log(
  products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    published: p.published_at,
    price: p.variants?.[0]?.price,
  }))
)
const product = products.find((p) => /BUILD THE BODY/i.test(p.title))
if (!product) {
  console.log('product not found')
  process.exit(0)
}

const draft = await fetch(`https://${STORE}/admin/api/2025-01/products/${product.id}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    product: {
      id: product.id,
      status: 'draft',
      published: false,
    },
  }),
})
console.log('draft', draft.status, await draft.text())
