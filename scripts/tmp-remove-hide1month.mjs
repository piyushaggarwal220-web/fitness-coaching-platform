import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const GQL = `${API}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Cache-Control': 'no-cache' }

const themeRes = await fetch(GQL, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ themes(first: 50) { nodes { id name role } } }` }),
})
const main = (await themeRes.json()).data.themes.nodes.find((t) => t.role === 'MAIN')
const themeId = main.id.split('/').pop()
console.log('theme:', main.name, themeId, main.role)

const dir = path.join(process.cwd(), 'scripts', 'tmp-live-theme')

function stripHide(json) {
  const changes = []
  if (json.sections?.lurvox_hide_1month) {
    delete json.sections.lurvox_hide_1month
    changes.push('removed sections.lurvox_hide_1month')
  }
  if (Array.isArray(json.order)) {
    const before = json.order.length
    json.order = json.order.filter((k) => k !== 'lurvox_hide_1month')
    if (json.order.length !== before) changes.push('removed from order')
  }
  for (const [sid, sec] of Object.entries(json.sections || {})) {
    if (!sec.blocks) continue
    for (const bid of Object.keys(sec.blocks)) {
      const cl = sec.blocks[bid]?.settings?.custom_liquid
      if (typeof cl === 'string' && /lurvox-hide-1month-style|data-plan-index/.test(cl)) {
        delete sec.blocks[bid]
        if (Array.isArray(sec.block_order)) {
          sec.block_order = sec.block_order.filter((k) => k !== bid)
        }
        changes.push(`removed block ${sid}.${bid}`)
      }
    }
  }
  return changes
}

for (const key of ['templates/index.json', 'sections/header-group.json']) {
  const raw = fs.readFileSync(path.join(dir, key), 'utf8')
  const json = JSON.parse(raw)
  const changes = stripHide(json)
  console.log(`\n${key}: ${changes.length ? changes.join(', ') : 'no changes'}`)
  if (!changes.length) continue

  const value = JSON.stringify(json, null, 2)
  const res = await fetch(`${API}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const result = await res.json()
  if (!res.ok || result.errors) throw new Error(`${key}: ${JSON.stringify(result)}`)
  console.log(`  uploaded (${value.length} bytes)`)
}

console.log('\ndone')
