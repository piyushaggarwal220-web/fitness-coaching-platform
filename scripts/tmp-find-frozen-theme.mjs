import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

// Block instance id seen in the frozen live HTML
const LIVE_BLOCK = 'avjfcskfmuw05dxfvo'
const PREVIEW_BLOCK = 'aanbzv1bjqzbpoxj1a'

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

// ai_gen_id strips underscores, so search index.json for the raw id with underscores too
function hasId(json, compact) {
  if (!json) return false
  const normalized = json.replace(/_/g, '').toLowerCase()
  return normalized.includes(compact.toLowerCase())
}

for (const t of themes) {
  const idx = await getAsset(t.id, 'templates/index.json')
  if (!idx) {
    console.log(String(t.id).padEnd(14), t.role.padEnd(11), (t.name || '').slice(0, 32), 'NO_INDEX')
    continue
  }
  console.log(
    String(t.id).padEnd(14),
    t.role.padEnd(11),
    (t.name || '').slice(0, 32).padEnd(33),
    'liveBlock=' + String(hasId(idx, LIVE_BLOCK)).padEnd(5),
    'previewBlock=' + String(hasId(idx, PREVIEW_BLOCK)).padEnd(5),
    'bytes=' + idx.length
  )
}
