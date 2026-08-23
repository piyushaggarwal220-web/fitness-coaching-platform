import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const headers = { 'X-Shopify-Access-Token': token.access_token }
const themeId = '161112981755'

const r = await fetch(
  `https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/${themeId}/assets.json?asset[key]=sections/footer-group.json`,
  { headers }
)
const j = await r.json()
const v = j.asset?.value || ''
const consult = [...v.matchAll(/consult[^"]{0,40}/gi)].slice(0, 10)
console.log('consult matches', consult.map((m) => m[0]))
console.log('talk matches', [...v.matchAll(/\/pages\/[a-z-]*talk[a-z-]*/g)].map((m) => m[0]))

// Ensure consultation_url points to talk-coach
let next = v
if (next.includes('"consultation_url"')) {
  next = next.replace(/"consultation_url"\s*:\s*"[^"]*"/g, '"consultation_url": "/pages/talk-coach"')
}
if (next !== v) {
  const put = await fetch(`https://9uwyq1-0j.myshopify.com/admin/api/2025-01/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key: 'sections/footer-group.json', value: next } }),
  })
  console.log('footer put', put.status)
}

await new Promise((r) => setTimeout(r, 5000))
const home = await (await fetch('https://www.lurvox.in/?t=' + Date.now())).text()
console.log({
  talkCoachLinks: (home.match(/\/pages\/talk-coach/g) || []).length,
  oldLinks: (home.match(/href="\/pages\/talk-to-a-coach"/g) || []).length,
  redirect: home.includes('lurvox-talk-path-redirect-v1'),
  fabHref: home.match(/lurvox-fab__btn--primary"[\s\S]{0,80}href="([^"]+)"/)?.[1],
})

const ghost = await fetch('https://www.lurvox.in/pages/talk-to-a-coach?t=' + Date.now(), { redirect: 'manual' })
console.log('ghost status', ghost.status, ghost.headers.get('location'))
const talk = await (await fetch('https://www.lurvox.in/pages/talk-coach?t=' + Date.now())).text()
console.log('talk-coach form', talk.includes('lurvox-talk-coach__form'), 'api', talk.includes('app.lurvox.in/api/public/talk-to-a-coach'))
