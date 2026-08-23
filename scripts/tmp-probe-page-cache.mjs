import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache, no-store',
  Pragma: 'no-cache',
}

const SERVING = '161086767355'

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

console.log('=== asset read-back on serving theme ===')
for (const [key, marker] of [
  ['layout/theme.liquid', 'lurvox-mobile-talk-cta-v1'],
  ['blocks/ai_gen_block_361650c.liquid', 'lurvox-mobile-plan-cards-v1'],
  ['sections/lurvox-client-login.liquid', 'text-overflow: ellipsis'],
]) {
  const v = await getAsset(SERVING, key)
  console.log(' ', key, 'hasMarker=', v ? v.includes(marker) : 'NO_ASSET', 'bytes=', v?.length)
}

console.log('\n=== live page headers + size ===')
for (let i = 0; i < 3; i += 1) {
  const res = await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, {
    headers: UA,
    redirect: 'follow',
  })
  const html = await res.text()
  console.log(
    JSON.stringify({
      status: res.status,
      bytes: html.length,
      age: res.headers.get('age'),
      cfCache: res.headers.get('cf-cache-status'),
      xCache: res.headers.get('x-cache'),
      cacheControl: res.headers.get('cache-control'),
      serverTiming: res.headers.get('server-timing'),
      xDc: res.headers.get('x-dc'),
      hasTalkFix: html.includes('lurvox-mobile-talk-cta-v1'),
    })
  )
  await new Promise((r) => setTimeout(r, 1500))
}

console.log('\n=== section render endpoint (bypasses page cache) ===')
const page = await (
  await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, { headers: UA })
).text()
const sectionIds = [...page.matchAll(/id="shopify-section-([^"]+)"/g)].map((m) => m[1])
console.log('sections on page:', sectionIds.slice(0, 12))

const loginSection = sectionIds.find((s) => /lurvox_client_login/.test(s))
if (loginSection) {
  const res = await fetch(
    `https://www.lurvox.in/?section_id=${encodeURIComponent(loginSection)}&zz=${Date.now()}`,
    { headers: UA }
  )
  const html = await res.text()
  console.log(
    JSON.stringify({
      sectionId: loginSection,
      status: res.status,
      bytes: html.length,
      hasEllipsis: html.includes('text-overflow: ellipsis'),
      hasOld92: html.includes('max-width: 92px'),
      hasPromptSpan: html.includes('lurvox-client-login__prompt'),
    })
  )
} else {
  console.log('client login section id not found on page')
}
