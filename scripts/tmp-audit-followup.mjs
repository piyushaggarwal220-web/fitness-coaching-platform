import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const adminHeaders = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = { pageChecks: [], floatingPanel: {}, references: [] }

for (const url of [
  'https://www.lurvox.in/pages/league',
  'https://www.lurvox.in/pages/plans',
  'https://www.lurvox.in/pages/consistency-league',
]) {
  await sleep(3000)
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { headers: UA })
    const body = await res.text()
    out.pageChecks.push({
      url,
      status: res.status,
      bytes: body.length,
      title: (body.match(/<title>([^<]*)<\/title>/) || [])[1],
      hasLeagueHero: body.includes('lx-league__hero'),
    })
  } catch (err) {
    out.pageChecks.push({ url, status: 'error', message: String(err && err.message) })
  }
}

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: adminHeaders }
  )
  const json = await res.json()
  return json.asset?.value ?? null
}

const js = await getAsset('assets/floating-panel.js')
if (js) {
  fs.writeFileSync(
    'C:/Users/DELL/coaching-platform/scripts/tmp-audit-floating-panel.js.txt',
    js,
    'utf8'
  )
  out.floatingPanel = {
    bytes: js.length,
    startsWith: js.slice(0, 60),
    hasScriptOpenTag: js.includes('<script>'),
    hasScriptCloseTag: js.includes('</script>'),
    scriptOpenCount: (js.match(/<script>/g) || []).length,
  }
}

for (const key of ['layout/theme.liquid', 'sections/lurvox-league.liquid']) {
  const src = await getAsset(key)
  if (!src) continue
  out.references.push({
    key,
    referencesFloatingPanel: src.includes('floating-panel'),
    snippet: (src.match(/.{0,120}floating-panel.{0,120}/s) || [])[0] || null,
  })
}

console.log(JSON.stringify(out, null, 2))
