import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
for (const p of pages.filter((x) => /plan/i.test(x.handle) || /plan/i.test(x.title))) {
  console.log('\n===', p.handle, p.id, p.title, 'template:', p.template_suffix)
  const body = (p.body_html || '').replace(/\s+/g, ' ').slice(0, 800)
  console.log(body)
}
