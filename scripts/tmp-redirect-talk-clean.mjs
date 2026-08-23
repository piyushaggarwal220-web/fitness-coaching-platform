import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const themes = await (await fetch(`${API}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')

// Ensure clean consult page exists at a fresh handle
const pages = await (await fetch(`${API}/pages.json?limit=250`, { headers })).json()
let clean = (pages.pages || []).find((p) => p.handle === 'book-a-free-call')
if (!clean) {
  // Reuse current talk-to-a-coach page (the clean one we swapped onto that handle)
  // and also create a fresh-handle page that won't hit path cache.
  const create = await fetch(`${API}/pages.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      page: {
        title: 'Book a free consultation call',
        handle: 'book-a-free-call',
        body_html: '<!-- lurvox consult -->',
        template_suffix: 'talk-to-a-coach',
        published: true,
      },
    }),
  })
  const created = await create.json()
  if (!create.ok || created.errors) throw new Error(JSON.stringify(created).slice(0, 400))
  clean = created.page
  console.log('created', clean.id, clean.handle)
} else {
  console.log('exists', clean.id, clean.handle)
}

// Redirect stuck path to clean path
const redirects = await (await fetch(`${API}/redirects.json?limit=250`, { headers })).json()
const existing = (redirects.redirects || []).find(
  (r) => r.path === '/pages/talk-to-a-coach' || r.path === 'pages/talk-to-a-coach'
)
if (existing) {
  const del = await fetch(`${API}/redirects/${existing.id}.json`, {
    method: 'DELETE',
    headers,
  })
  console.log('deleted old redirect', existing.id, del.status)
}

const redir = await fetch(`${API}/redirects.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    redirect: {
      path: '/pages/talk-to-a-coach',
      target: '/pages/book-a-free-call',
    },
  }),
})
const redirJson = await redir.json()
if (!redir.ok || redirJson.errors) throw new Error(JSON.stringify(redirJson).slice(0, 400))
console.log('redirect', redirJson.redirect)

// Update theme links on MAIN
async function get(key) {
  const r = await fetch(
    `${API}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}
async function put(key, value) {
  const r = await fetch(`${API}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', key)
}

for (const key of [
  'sections/footer-group.json',
  'sections/mobile-floating-bar.liquid',
  'sections/header-group.json',
  'layout/theme.liquid',
]) {
  let value = await get(key)
  if (!value) continue
  if (!value.includes('/pages/talk-to-a-coach')) continue
  value = value.replaceAll('/pages/talk-to-a-coach', '/pages/book-a-free-call')
  await put(key, value)
}

function probe(html, label) {
  return {
    label,
    finalHint: html.includes('book-a-free-call') || html.includes('Book a free'),
    themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
    has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
    has179: /₹179/.test(html),
    has3m: /3 Months/i.test(html),
  }
}

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const cleanHtml = await (
    await fetch(`https://www.lurvox.in/pages/book-a-free-call?v=${Date.now()}&i=${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126', 'Cache-Control': 'no-cache' },
    })
  ).text()
  const stuckHtml = await (
    await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}&i=${i}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126', 'Cache-Control': 'no-cache' },
      redirect: 'follow',
    })
  ).text()
  const a = probe(cleanHtml, 'book-a-free-call')
  const b = probe(stuckHtml, 'talk-to-a-coach')
  console.log(i, JSON.stringify(a), JSON.stringify(b))
  if (!a.has7Day && a.has3m) {
    console.log('CLEAN PAGE OK')
    if (!b.has7Day) {
      console.log('REDIRECT PATH ALSO CLEAN')
      process.exit(0)
    }
  }
}

console.log('clean page ready at /pages/book-a-free-call')
