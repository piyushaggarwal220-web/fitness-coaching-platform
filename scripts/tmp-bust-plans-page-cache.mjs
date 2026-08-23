const urls = [
  `https://www.lurvox.in/pages/plans?cb=${Date.now()}`,
  `https://www.lurvox.in/pages/plans`,
  `https://9uwyq1-0j.myshopify.com/pages/plans?cb=${Date.now()}`,
]

for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  })
  const html = await res.text()
  const rte = html.match(/lurvox-page-rte[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || ''
  const text = rte.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('\nURL', url)
  console.log('headers', {
    cf: res.headers.get('cf-cache-status'),
    cache: res.headers.get('cache-control'),
    age: res.headers.get('age'),
    vary: res.headers.get('vary'),
  })
  console.log('stamp', html.includes('lurvox-plans-no-1month'))
  console.log('exact1', /(?<!\d)1 Month/.test(html))
  console.log('rte text:', text.slice(0, 500))
}

// Force page update with unique visible string
import fs from 'node:fs'
import path from 'node:path'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const APP = 'https://app.lurvox.in'
const visible = `UPDATED_${Date.now()}`
const body = `<p data-lurvox-plans-ver="${visible}"><strong>${visible}</strong></p>
<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h2 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h2>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month.</p>
  <h3 style="margin:28px 0 10px;font-size:18px;">Plans</h3>
  <ol style="margin:0 0 8px;padding-left:18px;">
    <li style="margin-bottom:10px;"><strong>3 Months — ₹999</strong> (≈ ₹333/month · SAVE ₹498)<br/><a href="${APP}/plans/3-months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — ₹1699</strong> (≈ ₹283/month · SAVE ₹1,295) · Most popular<br/><a href="${APP}/plans/6-months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — ₹2999</strong> (≈ ₹250/month · SAVE ₹2,989) · Best value<br/><a href="${APP}/plans/12-months">Start 12 Months →</a></li>
  </ol>
</div>`

const pages = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({ query: `{ pages(first:20, query:"handle:plans"){nodes{id}}}` }),
}).then((r) => r.json())
const id = pages.data.pages.nodes[0].id
await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){ page{body} userErrors{message}}}`,
    variables: { id, page: { body, isPublished: true, title: 'PLANS' } },
  }),
})
console.log('\nwrote visible marker', visible)

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const html = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const sec = await fetch(
    `https://www.lurvox.in/pages/plans?sections=lurvox-page-content&cb=${Date.now()}-${i}`
  ).then((r) => r.text())
  console.log(i, {
    fullHasVisible: html.includes(visible),
    sectionHasVisible: sec.includes(visible),
    fullExact1: /(?<!\d)1 Month/.test(html),
  })
  if (html.includes(visible)) {
    console.log('FULL PAGE UPDATED')
    break
  }
}
