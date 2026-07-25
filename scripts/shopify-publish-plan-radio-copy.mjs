/**
 * Publish the plan-radio-fix theme copy as the live main theme.
 * Live main stays untouched until this role switch succeeds.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const COPY_ID = 161112326395
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  Accept: 'text/html',
}

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

const copyBlock = await getAsset(COPY_ID, 'blocks/ai_gen_block_361650c.liquid')
if (!copyBlock.includes('lurvox-hide-plan-radios-v1')) {
  console.error(JSON.stringify({ error: 'copy is missing radio-hide marker; abort publish' }, null, 2))
  process.exit(1)
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

// Live storefront check (may need a couple attempts if CDN lags).
let live = null
for (let attempt = 1; attempt <= 4; attempt += 1) {
  await new Promise((r) => setTimeout(r, attempt === 1 ? 2000 : 5000))
  const res = await fetch(`https://www.lurvox.in/?published=${Date.now()}`, {
    headers: UA,
    redirect: 'follow',
  })
  const body = await res.text()
  live = {
    attempt,
    status: res.status,
    hasHideMarker: body.includes('lurvox-hide-plan-radios-v1'),
    // In rendered CSS the marker comment may survive; also check display:none on radio class.
    radioHideInCss: /ai-transformation-plan-radio-[^{]+\{[^}]*display:\s*none\s*!important/.test(body),
  }
  if (live.hasHideMarker || live.radioHideInCss) break
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
