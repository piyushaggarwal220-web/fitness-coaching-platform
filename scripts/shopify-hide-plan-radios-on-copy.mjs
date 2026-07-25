/**
 * On THEME COPY only: remove plan-card radio circles.
 *
 * Cards already navigate on click (lurvox-plan-direct-nav), and equal-shine
 * forced every card to show a filled radio — so every card had an outer ring
 * with an inner filled circle. Hide the radios entirely on the unpublished copy.
 *
 * Does NOT touch the live (main) theme.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const COPY_ID = 161112326395
const BLOCK_KEY = 'blocks/ai_gen_block_361650c.liquid'
const MARKER = 'lurvox-hide-plan-radios-v1'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const HIDE_CSS = `  /* ${MARKER} — radios are decorative now that cards navigate directly */
  .ai-transformation-plan-radio-{{ ai_gen_id }} {
    display: none !important;
  }
`

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} -> ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) }
}

const original = await getAsset(COPY_ID, BLOCK_KEY)
fs.writeFileSync(
  'C:/Users/DELL/coaching-platform/scripts/tmp-prerestore-ai_gen_block_361650c.liquid',
  original,
  'utf8'
)

let next = original.replace(
  new RegExp(`/\\* ${MARKER}[\\s\\S]*?\\.ai-transformation-plan-radio-\\{\\{ ai_gen_id \\}\\} \\{[\\s\\S]*?\\}\\s*`, 'g'),
  ''
)

// Insert hide rule just before the equal-shine block (or before endstyle).
if (next.includes('/* lurvox-equal-plan-shine */')) {
  next = next.replace('/* lurvox-equal-plan-shine */', `${HIDE_CSS}\n  /* lurvox-equal-plan-shine */`)
} else if (next.includes('{% endstyle %}')) {
  next = next.replace('{% endstyle %}', `${HIDE_CSS}\n{% endstyle %}`)
} else {
  console.error(JSON.stringify({ error: 'no insertion point found' }, null, 2))
  process.exit(1)
}

const put = await putAsset(COPY_ID, BLOCK_KEY, next)
const after = put.ok ? await getAsset(COPY_ID, BLOCK_KEY) : ''

console.log(
  JSON.stringify(
    {
      copyThemeId: COPY_ID,
      put,
      hasMarker: after.includes(MARKER),
      hasHideDisplayNone: after.includes('lurvox-hide-plan-radios-v1') && after.includes('display: none !important'),
      previewUrl: `https://www.lurvox.in/?preview_theme_id=${COPY_ID}`,
    },
    null,
    2
  )
)
