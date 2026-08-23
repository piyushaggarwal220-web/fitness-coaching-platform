/**
 * Fix floating-panel.js still hiding data-plan-index="1" (now the ₹179 trial).
 */
import fs from 'node:fs'
import path from 'node:path'

const THEME_ID = Number(process.argv[2] || 161294057723)
const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token

const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function getAsset(key) {
  const res = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 400))
  return json.asset.value
}

async function putAsset(key, value) {
  const res = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`)
  console.log('uploaded', key)
}

const KEY = 'assets/floating-panel.js'
let js = await getAsset(KEY)
fs.writeFileSync(path.join(process.env.TEMP, 'floating-panel-before.js'), js)

const needle = `document.querySelectorAll('[data-plan-index="1"]')`
const replacement = `document.querySelectorAll('[data-plan-index="1"][data-plan-price="999"],[data-plan-index="1"][data-plan-price="499"]')`

let count = 0
let next = js
while (next.includes(needle)) {
  next = next.replace(needle, replacement)
  count++
}

// Also catch double-quoted variants
const needle2 = 'document.querySelectorAll("[data-plan-index=\\"1\\"]")'
while (next.includes(`document.querySelectorAll("[data-plan-index=\\"1\\"]")`)) {
  next = next.replace(
    `document.querySelectorAll("[data-plan-index=\\"1\\"]")`,
    `document.querySelectorAll("[data-plan-index=\\"1\\"][data-plan-price=\\"999\\"],[data-plan-index=\\"1\\"][data-plan-price=\\"499\\"]")`
  )
  count++
}

if (count === 0) {
  const m = js.match(/.{0,80}data-plan-index.{0,120}/g)
  console.log('no exact needle; matches:', m)
  throw new Error('Could not patch floating-panel.js')
}

await putAsset(KEY, next)
console.log('replacements', count)
