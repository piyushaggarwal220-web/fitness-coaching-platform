import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const pages = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `{ pages(first:50){ nodes{ id handle title body updatedAt } } }`,
  }),
}).then((r) => r.json())

for (const p of pages.data.pages.nodes.filter((p) => p.handle.includes('plan'))) {
  console.log({
    handle: p.handle,
    id: p.id,
    updatedAt: p.updatedAt,
    has1: /1 Month\s*—/.test(p.body || ''),
    has3: /3 Months\s*—/.test(p.body || ''),
    snippet: (p.body || '').replace(/\s+/g, ' ').slice(0, 180),
  })
}

// Follow redirects for /pages/plans
const res = await fetch('https://www.lurvox.in/pages/plans?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  redirect: 'manual',
})
console.log('status', res.status, 'location', res.headers.get('location'))
const html = res.status === 200 ? await res.text() : ''
if (html) {
  console.log('canonical', html.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1])
  console.log('page id in html?', html.match(/Page\/(\d+)/)?.[1] || html.match(/page_id['"]=(\d+)/)?.[1])
  // Shopify often exposes meta
  console.log('shopify page meta', html.match(/Shopify\.shop\s*=/)?.[0])
}

// Check redirects API
const redirects = await fetch(`${REST}/redirects.json?limit=250&path=/pages/plans`, { headers }).then(
  (r) => r.json()
)
console.log('redirects involving plans', JSON.stringify(redirects).slice(0, 1000))

const allRedirects = await fetch(`${REST}/redirects.json?limit=250`, { headers }).then((r) => r.json())
const planRedirects = (allRedirects.redirects || []).filter(
  (r) => /plan/i.test(r.path) || /plan/i.test(r.target)
)
console.log('plan redirects', planRedirects)
