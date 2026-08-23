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

const BODY = `<!-- lurvox-talk-wa-redirect:${Date.now()} -->
<meta http-equiv="refresh" content="0;url=${WA}">
<script>window.location.replace(${JSON.stringify(WA)});</script>
<p style="font-family:system-ui;padding:24px;text-align:center;">
  Opening WhatsApp… <a href="${WA}">Tap here if it doesn’t open</a>
</p>`

// Recreate handle talk-coach as published redirect page
const create = await fetch(`${REST}/pages.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    page: {
      title: 'Talk to a coach',
      handle: 'talk-coach',
      body_html: BODY,
      published: true,
    },
  }),
})
const created = await create.json()
console.log('create', create.status, created.page?.id, created.errors || created.page?.handle)

await new Promise((r) => setTimeout(r, 4000))

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 2500))
  const res = await fetch(`https://www.lurvox.in/pages/talk-coach?cb=${Date.now()}-${i}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
  let html = ''
  if (res.status === 200) html = await res.text()
  const ok =
    res.status === 301 ||
    res.status === 302 ||
    html.includes('lurvox-talk-wa-redirect') ||
    (html.includes('location.replace') && html.includes('free%20consultation'))
  console.log(i, {
    status: res.status,
    loc: res.headers.get('location'),
    stamp: html.includes('lurvox-talk-wa-redirect'),
    consult: html.includes('free%20consultation'),
  })
  if (ok) {
    console.log('SUCCESS')
    break
  }
}

// Also ensure footer FAB setting still WA
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
const footerRaw = (
  await (
    await fetch(
      `${REST}/themes/${main.id}/assets.json?asset[key]=sections/footer-group.json&t=${Date.now()}`,
      { headers }
    )
  ).json()
).asset.value
const footer = JSON.parse(footerRaw.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
console.log('fab consultation_url', footer.sections?.mobile_floating_bar?.settings?.consultation_url)
