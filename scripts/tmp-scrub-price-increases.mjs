/**
 * Finish scrubbing Price increases injection from theme assets + find loaders.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function safeJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 200) }
  }
}

async function gql(query, variables = {}) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(GQL, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ query, variables }),
    })
    const json = await safeJson(res)
    if (json?.errors) throw new Error(JSON.stringify(json.errors, null, 2))
    if (json?.data) return json.data
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('gql failed')
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return safeJson(res)
}

async function putAsset(themeId, key, value) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ asset: { key, value } }),
    })
    const j = await safeJson(res)
    if (j?.asset) return j.asset
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('put failed ' + key)
}

const themes = await gql(`{ themes(first: 50) { nodes { id name role } } }`)
const targets = themes.themes.nodes.filter((theme) => {
  const id = theme.id.split('/').pop()
  return (
    theme.role === 'MAIN' ||
    ['161389281531', '161390362875', '161391804667', '161375289595'].includes(id)
  )
})

const keys = [
  'assets/lurvox-hide-1month.js',
  'assets/lurvox-tap-plan-force.js',
  'assets/lurvox-offer-overlay.js',
]

for (const theme of targets) {
  const themeId = theme.id.split('/').pop()
  for (const key of keys) {
    const got = await getAsset(themeId, key)
    const body = got?.asset?.value
    if (!body) {
      console.log('missing', themeId, key)
      continue
    }
    const hasPhrase = /Price increases in/i.test(body)
    const hasV3 = /lurvox-offer-overlay v3/i.test(body)
    console.log(themeId, key, { hasPhrase, hasV3, len: body.length })
    if (!hasPhrase) continue

    let cleaned = body
    // Remove the whole fixPlanTimer function if present
    cleaned = cleaned.replace(
      /function fixPlanTimer\(\)\s*\{[\s\S]*?\n  \}/g,
      'function fixPlanTimer(){ /* disabled — SALE ENDS IN only */ }'
    )
    cleaned = cleaned.replace(
      /label\.textContent\s*=\s*['"]Price increases in ['"];?/g,
      '/* removed price increases label */'
    )
    // If still present, strip inject block more aggressively
    if (/Price increases in/i.test(cleaned) && key !== 'assets/lurvox-offer-overlay.js') {
      const marker = '/* lurvox-offer-overlay'
      const idx = cleaned.indexOf(marker)
      if (idx >= 0) {
        // Keep file before overlay append, then append v3 cleaner only
        cleaned = cleaned.slice(0, idx)
      }
    }
    if (cleaned !== body) {
      await putAsset(themeId, key, cleaned)
      console.log('updated', themeId, key)
    } else {
      console.log('could not auto-clean', themeId, key)
    }
    await new Promise((r) => setTimeout(r, 800))
  }
}

const tags = await safeJson(
  await fetch(`${REST}/script_tags.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  })
)
console.log(
  'script_tags',
  (tags?.script_tags || []).map((t) => ({ id: t.id, src: t.src }))
)

console.log('done')
