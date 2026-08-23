import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

const index = await (
  await fetch(`${REST}/themes/${THEME_ID}/assets.json?asset[key]=templates/index.json`, {
    headers,
  })
).json()
const raw = index.asset.value

const wa = [...raw.matchAll(/https:\\\/\\\/wa\.me\\\/919220451577[^"]*/g)].map((m) => m[0])
const consult = [...raw.matchAll(/consultation_[a-z]+"\s*:\s*"([^"]*)"/g)].map((m) => [m[0], m[1]])
const book = [...raw.matchAll(/Book a free consultation[^"]*/gi)].map((m) => m[0])

console.log({
  waLinks: wa.slice(0, 20),
  waCount: wa.length,
  consultSettings: consult.slice(0, 20),
  bookLabels: book.slice(0, 10),
})

const header = await (
  await fetch(`${REST}/themes/${THEME_ID}/assets.json?asset[key]=sections/header-group.json`, {
    headers,
  })
).json()
const h = header.asset?.value || ''
console.log('header wa', [...h.matchAll(/wa\.me[^"]*/g)].map((m) => m[0]).slice(0, 10))
console.log(
  'header consult',
  [...h.matchAll(/consultation_[a-z]+"\s*:\s*"([^"]*)"/g)].map((m) => m[0])
)
