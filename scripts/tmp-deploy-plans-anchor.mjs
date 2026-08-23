import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const themes = [161429127419, 161391804667]

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) {
    throw new Error(`${themeId} ${key} ${JSON.stringify(json).slice(0, 300)}`)
  }
  console.log('ok', themeId, key, value.length)
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(`${themeId} get ${key} ${JSON.stringify(json).slice(0, 200)}`)
  return json.asset.value
}

function patchIndex(indexJson) {
  let next = indexJson
  // Inline matrix custom_liquid often escapes quotes as \"
  const patterns = [
    ['<section class=\\"lx-matrix\\" aria-labelledby=\\"lx-matrix-title\\">', '<section class=\\"lx-matrix\\" id=\\"plans\\" aria-labelledby=\\"lx-matrix-title\\">'],
    ['<section class="lx-matrix" aria-labelledby="lx-matrix-title">', '<section class="lx-matrix" id="plans" aria-labelledby="lx-matrix-title">'],
  ]
  let changed = false
  for (const [from, to] of patterns) {
    if (next.includes(from) && !next.includes('lx-matrix\\" id=\\"plans\\"') && !next.includes('lx-matrix" id="plans"')) {
      next = next.replace(from, to)
      changed = true
    } else if (next.includes(from) && next.includes('id=\\"plans\\"')) {
      // already has somehow elsewhere; still replace this occurrence if missing id on this tag
      if (!next.includes('class=\\"lx-matrix\\" id=\\"plans\\"') && !next.includes('class="lx-matrix" id="plans"')) {
        next = next.replace(from, to)
        changed = true
      }
    }
  }
  // If already patched, keep
  if (
    next.includes('class=\\"lx-matrix\\" id=\\"plans\\"') ||
    next.includes('class="lx-matrix" id="plans"')
  ) {
    return { next, changed: changed || next !== indexJson, already: true }
  }
  if (!changed) {
    // fallback: inject id after first lx-matrix class
    const re = /(<section class=\\"lx-matrix\\")(?![^>]*\\bid=)/
    if (re.test(next)) {
      next = next.replace(re, '$1 id=\\"plans\\"')
      changed = true
    }
  }
  return { next, changed, already: false }
}

const boost = fs.readFileSync(
  path.join(ROOT, 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'),
  'utf8'
)
if (!boost.includes('setTimeout(ensurePlansAnchor')) {
  throw new Error('boost missing delayed ensurePlansAnchor')
}

for (const themeId of themes) {
  await putAsset(themeId, 'snippets/lurvox-conversion-boost.liquid', boost)

  const index = await getAsset(themeId, 'templates/index.json')
  const { next, changed, already } = patchIndex(index)
  console.log('index patch', themeId, { changed, already, hasId: next.includes('id=\\"plans\\"') || next.includes('id="plans"') })
  if (changed || already) {
    // Always write if we have id now and content differs
    if (next !== index) {
      fs.writeFileSync(`scripts/tmp-index-patched-${themeId}.json`, next)
      await putAsset(themeId, 'templates/index.json', next)
    } else {
      console.log('index unchanged for', themeId)
    }
  } else {
    throw new Error(`could not patch index.json for ${themeId}`)
  }
}

console.log('deployed')
