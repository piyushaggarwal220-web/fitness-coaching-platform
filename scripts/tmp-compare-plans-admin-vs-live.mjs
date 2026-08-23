const html = await fetch('https://www.lurvox.in/pages/plans?cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

console.log({
  template: html.match(/template--(\d+)/)?.[1],
  sections: [...html.matchAll(/id="shopify-section-([^"]+)"/g)].map((m) => m[1]),
  hasPageContent: html.includes('shopify-section') && html.includes('page'),
  hasExact1Month: /(?<!\d)1 Month/.test(html),
  hasStamp: html.includes('lurvox-plans-no-1month'),
  hasProbe: html.includes('PLAN_PROBE'),
  bodySnippet: html
    .replace(/\s+/g, ' ')
    .match(/Choose your plan[\s\S]{0,400}|PLANS[\s\S]{0,200}/i)?.[0]
    ?.slice(0, 350),
})

// Compare admin page body via GraphQL vs storefront
import fs from 'node:fs'
import path from 'node:path'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const pages = await fetch(GQL, {
  method: 'POST',
  headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{ pages(first:20, query:"handle:plans"){ nodes{ handle body updatedAt } } }`,
  }),
}).then((r) => r.json())
const p = pages.data.pages.nodes[0]
console.log('admin', {
  updatedAt: p.updatedAt,
  hasStamp: p.body.includes('lurvox-plans-no-1month'),
  hasExact1: /(?<!\d)1 Month/.test(p.body),
  has3: p.body.includes('3 Months'),
  snippet: p.body.replace(/\s+/g, ' ').slice(0, 200),
})
