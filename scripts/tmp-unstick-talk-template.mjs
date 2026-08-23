import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const pageId = 133883003131
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token.access_token,
}

async function put(body) {
  const response = await fetch(`https://${STORE}/admin/api/2025-01/pages/${pageId}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ page: { id: pageId, ...body } }),
  })
  const json = await response.json()
  console.log('put', body, '->', json.page?.template_suffix, response.status)
  return json
}

await put({ template_suffix: '' })
await new Promise((r) => setTimeout(r, 1500))
await put({ template_suffix: 'talk-to-a-coach', body_html: ' ' })
await new Promise((r) => setTimeout(r, 2000))
await put({ body_html: '' })

const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?ts=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache' },
})).text()
const m = html.match(/template:\s*\{\s*name:\s*'([^']+)'/)
console.log('storefront template', m?.[1])
console.log('has form', html.includes('lurvox-talk-coach__form'))
