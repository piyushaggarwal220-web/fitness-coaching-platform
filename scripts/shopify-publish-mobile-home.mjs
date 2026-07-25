/**
 * Publish LURVOX Mobile Home Fix theme as live main.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const COPY_ID = 161112981755
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'text/html',
}

const CHECKS = [
  ['blocks/ai_gen_block_cd3c949.liquid', 'lurvox-mobile-client-results-v1'],
  ['blocks/ai_gen_block_52353f6.liquid', 'lurvox-mobile-fitness-gallery-v1'],
  ['blocks/ai_gen_block_361650c.liquid', 'lurvox-mobile-plan-cards-v1'],
  ['layout/theme.liquid', 'lurvox-mobile-talk-cta-v1'],
]

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  return (await res.json()).themes
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

const beforeThemes = await listThemes()
const beforeMain = beforeThemes.find((t) => t.role === 'main')
const copy = beforeThemes.find((t) => t.id === COPY_ID)

if (!copy) {
  console.error(JSON.stringify({ error: 'copy theme not found', beforeThemes }, null, 2))
  process.exit(1)
}

for (const [key, marker] of CHECKS) {
  const value = await getAsset(COPY_ID, key)
  if (!value.includes(marker)) {
    console.error(JSON.stringify({ error: `missing ${marker} in ${key}` }, null, 2))
    process.exit(1)
  }
}

const putRes = await fetch(`${REST}/themes/${COPY_ID}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ theme: { id: COPY_ID, role: 'main' } }),
})
const putJson = await putRes.json()

await new Promise((r) => setTimeout(r, 4000))

const afterThemes = await listThemes()
const afterMain = afterThemes.find((t) => t.role === 'main')
const previousMain = afterThemes.find((t) => t.id === beforeMain?.id)

let live = null
for (let attempt = 1; attempt <= 5; attempt += 1) {
  await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 4000))
  const res = await fetch(`https://www.lurvox.in/?published=${Date.now()}`, {
    headers: UA,
    redirect: 'follow',
  })
  const body = await res.text()
  live = {
    attempt,
    status: res.status,
    clientResults: body.includes('lurvox-mobile-client-results-v1'),
    gallery: body.includes('lurvox-mobile-fitness-gallery-v1'),
    plans: body.includes('lurvox-mobile-plan-cards-v1'),
    talk: body.includes('lurvox-mobile-talk-cta-v1'),
  }
  if (live.clientResults && live.gallery && live.plans && live.talk) break
}

console.log(
  JSON.stringify(
    {
      beforeMain: beforeMain ? { id: beforeMain.id, name: beforeMain.name } : null,
      published: {
        ok: putRes.ok,
        status: putRes.status,
        theme: putJson.theme
          ? { id: putJson.theme.id, name: putJson.theme.name, role: putJson.theme.role }
          : null,
        error: putRes.ok ? undefined : putJson,
      },
      afterMain: afterMain ? { id: afterMain.id, name: afterMain.name, role: afterMain.role } : null,
      previousMainNow: previousMain
        ? { id: previousMain.id, name: previousMain.name, role: previousMain.role }
        : null,
      live,
    },
    null,
    2
  )
)
