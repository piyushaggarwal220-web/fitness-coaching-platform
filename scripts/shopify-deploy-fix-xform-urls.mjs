/**
 * Fix transformation carousel: restore hyphens in shopify:// image URLs
 * that were mangled by the no-hyphens copy pass ("2026-07" → "2026 to 07").
 */
import fs from 'node:fs'
import path from 'node:path'

const THEME_ID = 161454620923
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

async function get(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`get ${key}: ${res.status} ${await res.text()}`)
  return (await res.json()).asset.value
}

async function put(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`put ${key}: ${res.status} ${await res.text()}`)
  console.log('uploaded', key)
}

function fixShopifyUrls(value) {
  if (typeof value !== 'string') return { value, changed: false }
  if (!value.includes('shopify://')) return { value, changed: false }
  // "2026 to 07-15" or "2026 to 07 to 15" style damage from hyphen scrub
  let next = value
  // common pattern: date fragments "YYYY to MM" / "MM to DD"
  next = next.replace(/(\d{4}) to (\d{2})/g, '$1-$2')
  next = next.replace(/(\d{2}) to (\d{2})(?=_|\.|$)/g, '$1-$2')
  // also fix class typo if present in liquid separately
  return { value: next, changed: next !== value }
}

function walk(obj, pathParts = []) {
  const fixes = []
  if (!obj || typeof obj !== 'object') return fixes
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      if (typeof v === 'string') {
        const { value, changed } = fixShopifyUrls(v)
        if (changed) {
          obj[i] = value
          fixes.push([...pathParts, i].join('.') + ` => ${value}`)
        }
      } else if (v && typeof v === 'object') {
        fixes.push(...walk(v, [...pathParts, String(i)]))
      }
    })
    return fixes
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      const { value, changed } = fixShopifyUrls(v)
      if (changed) {
        obj[k] = value
        fixes.push([...pathParts, k].join('.') + ` => ${value}`)
      }
    } else if (v && typeof v === 'object') {
      fixes.push(...walk(v, [...pathParts, k]))
    }
  }
  return fixes
}

const index = JSON.parse(await get('templates/index.json'))
const fixes = walk(index)
console.log('fixed urls', fixes.length)
fixes.slice(0, 20).forEach((f) => console.log(' -', f))

await put('templates/index.json', `${JSON.stringify(index, null, 2)}\n`)

// Also fix broken class in transformation block liquid
let liquid = await get('blocks/ai_gen_block_cd3c949.liquid')
const before = liquid
liquid = liquid.replace(
  /ai-Real peopleclient-results-subheadline-/g,
  'ai-client-results-subheadline-'
)
if (liquid !== before) {
  await put('blocks/ai_gen_block_cd3c949.liquid', liquid)
  fs.writeFileSync('scripts/shopify-assets/blocks-ai_gen_block_cd3c949.liquid', liquid)
  console.log('fixed liquid class typo')
} else {
  console.log('liquid class already ok or different pattern')
}

// verify images on transform block
const b = index.sections.home_blocks_v2.blocks.ai_gen_block_cd3c949_6mqWVi
for (let i = 1; i <= 6; i++) {
  console.log(i, b.settings[`transformation_image_${i}`])
}

console.log('live', `https://www.lurvox.in/?v=xformfix${Date.now()}`)
