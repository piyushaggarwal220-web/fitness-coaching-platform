import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const THEME_ID = 161454620923
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

function deHindi(s) {
  return s
    .replace(
      /Built for India:\s*veg\s*\/\s*ghar[-\s]ka[-\s]khana diets/gi,
      'Built for India: vegetarian and home cooked diets'
    )
    .replace(
      /Veg\s*\/\s*ghar[-\s]ka[-\s]khana friendly/gi,
      'Vegetarian and home cooked food friendly'
    )
    .replace(/Ghar[-\s]ka[-\s]khana/g, 'Home cooked food')
    .replace(/ghar[-\s]ka[-\s]khana/gi, 'home cooked food')
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

const local = [
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['snippets/lurvox-conversion-boost.liquid', 'scripts/shopify-assets/snippets-lurvox-conversion-boost.liquid'],
  ['sections/lurvox-how-it-works.liquid', 'scripts/shopify-assets/sections-lurvox-how-it-works.liquid'],
  ['sections/lurvox-ad-landing.liquid', 'scripts/shopify-assets/sections-lurvox-ad-landing.liquid'],
]
for (const [key, rel] of local) {
  await put(key, fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

const listed = await fetch(`${API}/themes/${THEME_ID}/assets.json`, { headers })
if (!listed.ok) throw new Error(`list ${listed.status} ${await listed.text()}`)
const assets = (await listed.json()).assets || []
const candidates = assets
  .map((a) => a.key)
  .filter((key) => /\.(liquid|json)$/i.test(key) && !key.startsWith('assets/'))

const patched = []
for (const key of candidates) {
  let value
  try {
    value = await get(key)
  } catch {
    continue
  }
  if (!/ghar|khana/i.test(value)) continue
  const next = deHindi(value)
  if (next === value) {
    console.log('unpatched leftover', key)
    continue
  }
  await put(key, next)
  patched.push(key)
}

console.log('patched', patched)
console.log('live', `https://www.lurvox.in/?v=en${Date.now()}`)
