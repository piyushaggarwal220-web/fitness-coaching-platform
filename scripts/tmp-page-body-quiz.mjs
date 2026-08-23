import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const res = await fetch(GQL, {
  method: 'POST',
  headers: {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `{
      pages(first: 20, query: "handle:find-your-plan") {
        nodes { id handle title templateSuffix body }
      }
    }`,
  }),
})
const json = await res.json()
const page = json.data.pages.nodes[0]
console.log({
  handle: page?.handle,
  templateSuffix: page?.templateSuffix,
  bodyHasGhar: /ghar/i.test(page?.body || ''),
  bodyLen: (page?.body || '').length,
  bodyHead: (page?.body || '').slice(0, 300),
})

const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?preview_theme_id=161454620923&cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0 verify' },
  })
).text()
console.log('preview', {
  ghar: /ghar[-\s]?ka[-\s]?khana/i.test(html),
  homeCooked: /Home cooked food/.test(html),
  newBust: /lurvox-cache-bust 1786438714571/.test(html),
  template: (html.match(/template\s*[:=]\s*['"]([^'"]+)/i) || [])[1],
  sectionType: (html.match(/shopify-section-lurvox[^\s"]+/g) || []).slice(0, 8),
})
