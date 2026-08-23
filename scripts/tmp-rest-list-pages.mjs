import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const headers = { 'X-Shopify-Access-Token': token.access_token }

const pages = await (await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/pages.json?limit=250', { headers })).json()
const matches = (pages.pages || []).filter((p) =>
  /talk|coach|contact/i.test(`${p.handle} ${p.title}`)
)
console.log('REST pages', matches.map((p) => ({ id: p.id, handle: p.handle, title: p.title, template_suffix: p.template_suffix, published_at: p.published_at })))

const redirects = await (await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/redirects.json?limit=250', { headers })).json()
console.log(
  'redirects',
  (redirects.redirects || []).filter((r) => /talk|coach/i.test(`${r.path} ${r.target}`))
)

// Direct myshopify vs custom domain headers
for (const host of ['www.lurvox.in', '9uwyq1-0j.myshopify.com']) {
  const res = await fetch(`https://${host}/pages/talk-to-a-coach`, { redirect: 'manual' })
  console.log(host, res.status, res.headers.get('x-shopid'), res.headers.get('link'))
}
