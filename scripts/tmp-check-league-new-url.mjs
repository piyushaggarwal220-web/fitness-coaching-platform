const urls = [
  'https://www.lurvox.in/pages/consistency-league-new?v=' + Date.now(),
  'https://www.lurvox.in/pages/consistency-league?v=' + Date.now(),
  'https://www.lurvox.in/pages/consistency-league?view=consistency-league&v=' + Date.now(),
]

// Also list all pages
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

const pagesRes = await fetch(
  'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/pages.json?limit=50',
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
)
const pages = await pagesRes.json()
console.log(
  'pages',
  pages.pages.map((p) => ({
    id: p.id,
    handle: p.handle,
    template_suffix: p.template_suffix,
    title: p.title,
  }))
)

for (const url of urls) {
  const res = await fetch(url, { redirect: 'follow' })
  const html = await res.text()
  console.log({
    requested: url.split('?')[0],
    final: res.url.split('?')[0],
    status: res.status,
    dataTemplate: html.match(/data-template="([^"]+)"/)?.[1],
    hasBack: html.includes('lx-league__back'),
    sectionIds: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]),
    title: html.match(/<title>([^<]+)</)?.[1],
  })
}

// Check redirects
const redir = await fetch(
  'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/redirects.json?limit=100',
  { headers: { 'X-Shopify-Access-Token': token.access_token } }
).then((r) => r.json())
const hits = (redir.redirects || []).filter(
  (r) => /league|consist/i.test(r.path) || /league|consist/i.test(r.target)
)
console.log('redirects', hits)
