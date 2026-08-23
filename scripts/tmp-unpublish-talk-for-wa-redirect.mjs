import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const WA =
  'https://wa.me/919220451577?text=' +
  encodeURIComponent('i want a free consultation call and more info')

const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
const talk = pages.find((p) => p.handle === 'talk-coach')
console.log('talk-coach', talk && { id: talk.id, published: talk.published_at })

if (talk) {
  // Unpublish so /pages/talk-coach URL redirect can fire
  const put = await fetch(`${REST}/pages/${talk.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      page: {
        id: talk.id,
        published: false,
        // also move handle so any residual page cache misses
        handle: `talk-coach-archived-${Date.now()}`,
        body_html: `<!-- archived; use WhatsApp ${WA} -->`,
      },
    }),
  })
  console.log('unpublish+rename', put.status, (await put.text()).slice(0, 300))
}

// Ensure redirects
const redirects = (await (await fetch(`${REST}/redirects.json?limit=250`, { headers })).json())
  .redirects
for (const p of ['/pages/talk-coach', '/pages/talk-to-a-coach']) {
  const existing = redirects.find((r) => r.path === p)
  if (existing) {
    const put = await fetch(`${REST}/redirects/${existing.id}.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ redirect: { id: existing.id, path: p, target: WA } }),
    })
    console.log('redirect update', p, put.status)
  } else {
    const create = await fetch(`${REST}/redirects.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ redirect: { path: p, target: WA } }),
    })
    console.log('redirect create', p, create.status)
  }
}

await new Promise((r) => setTimeout(r, 3000))

for (const u of [
  'https://www.lurvox.in/pages/talk-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach',
]) {
  const res = await fetch(u, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
  console.log(u, res.status, res.headers.get('location'))
}
