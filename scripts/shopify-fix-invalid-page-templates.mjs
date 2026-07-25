/**
 * Clear invalid page template_suffix values.
 *
 * Five published pages pointed at suffixes whose theme templates do not exist
 * (`Default page`, `page`, `transform`). Shopify was silently falling back to
 * templates/page.json — this makes that explicit by clearing the suffix.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const FIXES = [
  { handle: 'coaching-plans', id: 133185372411 },
  { handle: 'payment-success', id: 133913641211 },
  { handle: 'plans', id: 133838307579 },
  { handle: 'subscribe', id: 133298356475 },
  { handle: 'transform', id: 133180686587 },
]

const results = []

for (const page of FIXES) {
  const beforeRes = await fetch(`${REST}/pages/${page.id}.json`, { headers })
  const before = (await beforeRes.json()).page

  const putRes = await fetch(`${REST}/pages/${page.id}.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      page: {
        id: page.id,
        template_suffix: null,
      },
    }),
  })
  const putBody = await putRes.json()
  const after = putBody.page

  results.push({
    handle: page.handle,
    id: page.id,
    putOk: putRes.ok,
    putStatus: putRes.status,
    beforeSuffix: before?.template_suffix ?? null,
    afterSuffix: after?.template_suffix ?? null,
    putError: putRes.ok ? undefined : JSON.stringify(putBody).slice(0, 300),
  })
}

// Confirm each page still renders.
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const live = []

for (const page of FIXES) {
  let entry = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await sleep(attempt === 1 ? 4000 : 10000)
    const res = await fetch(`https://www.lurvox.in/pages/${page.handle}?t=${Date.now()}`, {
      headers: UA,
      redirect: 'follow',
    })
    const body = await res.text()
    entry = {
      handle: page.handle,
      attempt,
      status: res.status,
      bytes: body.length,
      title: (body.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 50),
    }
    if (res.status !== 503) break
  }
  live.push(entry)
}

console.log(JSON.stringify({ results, live }, null, 2))
