import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const shop = await (await fetch(`${REST}/shop.json`, { headers: H })).json()
console.log('shop', shop.shop?.name, shop.shop?.domain)

// Touch shop metafield-like fields that may invalidate index cache
const body = {
  shop: {
    id: shop.shop.id,
    // no-op safe touch: append/remove zero-width space from checkout note / or use email
  },
}

// Try updating a harmless preference
const put = await fetch(`${REST}/shop.json`, {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({
    shop: {
      id: shop.shop.id,
      customer_accounts_optional: shop.shop.customer_accounts_optional ?? undefined,
    },
  }),
})
console.log('shop put', put.status, (await put.text()).slice(0, 200))

// Create/update a URL redirect from a cache-buster path - not for /
const redirects = await (
  await fetch(`${REST}/redirects.json?limit=5`, { headers: H })
).json()
console.log('redirects sample', redirects.redirects?.slice(0, 3))

// Poll /?view= empty and bare / once more after a longer wait
for (const url of [
  `https://www.lurvox.in/?view=&x=${Date.now()}`,
  `https://www.lurvox.in/index?x=${Date.now()}`,
  `https://www.lurvox.in/?x=${Date.now()}`,
]) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    },
  })
  const html = await res.text()
  console.log({
    url: url.split('?')[0] + '?',
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    hasForce: html.includes('lurvoxTapWired'),
    hasGoToPlan: html.includes('goToPlan'),
    etag: res.headers.get('etag')?.slice(0, 60),
  })
}
