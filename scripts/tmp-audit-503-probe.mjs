import fs from 'node:fs'
import path from 'node:path'

const SHOP = '9uwyq1-0j.myshopify.com'
const REST = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probe(url) {
  await sleep(1500)
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: UA })
    const body = await res.text()
    return {
      url,
      status: res.status,
      bytes: body.length,
      title: (body.match(/<title>([^<]*)<\/title>/) || [])[1]?.trim().slice(0, 60),
      hasLeague: body.includes('lx-league'),
      hasCrazyEligibility: body.includes('crazy-eligibility'),
    }
  } catch (err) {
    return { url, status: 'error', message: String(err && err.message).slice(0, 120) }
  }
}

const out = { customDomain: [], myshopify: [], probePage: null }

const paths = [
  '/pages/league',
  '/pages/consistency-league',
  '/pages/plans',
  '/pages/coaching-plans',
  '/pages/transform',
  '/pages/subscribe',
  '/pages/about',
  '/pages/talk-to-a-coach',
]

for (const p of paths) {
  out.customDomain.push(await probe(`https://www.lurvox.in${p}`))
}
for (const p of ['/pages/league', '/pages/consistency-league']) {
  out.myshopify.push(await probe(`https://${SHOP}${p}`))
}

// Does a brand-new page using the same template render?
const createRes = await fetch(`${REST}/pages.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    page: {
      title: 'TMP League Probe',
      handle: 'tmp-league-probe',
      template_suffix: 'league-v2',
      body_html: '',
      published: true,
    },
  }),
})
const created = await createRes.json()
const probeId = created.page?.id

if (probeId) {
  await sleep(4000)
  const result = await probe('https://www.lurvox.in/pages/tmp-league-probe')
  out.probePage = { id: probeId, ...result }
  await fetch(`${REST}/pages/${probeId}.json`, { method: 'DELETE', headers })
  out.probePage.deleted = true
} else {
  out.probePage = { createError: JSON.stringify(created).slice(0, 300) }
}

console.log(JSON.stringify(out, null, 2))
