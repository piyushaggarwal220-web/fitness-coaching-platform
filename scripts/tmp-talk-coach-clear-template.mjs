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

const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages
const talk = pages.find((p) => p.handle === 'talk-coach')
console.log('before', {
  id: talk?.id,
  suffix: talk?.template_suffix,
  handle: talk?.handle,
})

const put = await fetch(`${REST}/pages/${talk.id}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    page: {
      id: talk.id,
      template_suffix: null,
      body_html: BODY,
      published: true,
    },
  }),
})
const updated = await put.json()
console.log('after', put.status, {
  suffix: updated.page?.template_suffix,
  body: updated.page?.body_html?.slice(0, 180),
})

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const html = await fetch(`https://www.lurvox.in/pages/talk-coach?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const ok =
    html.includes('lurvox-talk-wa-redirect') ||
    /location\.replace\([^)]*free%20consultation/.test(html)
  console.log(i, {
    stamp: html.includes('lurvox-talk-wa-redirect'),
    form: html.includes('lurvox-talk-coach__form'),
    waReplace: /location\.replace\([^)]*wa\.me\/919220451577\?text=i%20want%20a%20free/.test(html),
  })
  if (ok) {
    console.log('SUCCESS')
    break
  }
}
