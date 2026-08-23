import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const themeId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

const listRes = await fetch(`${REST}/themes/${themeId}/assets.json`, { headers })
const list = await listRes.json()
const keys = (list.assets || []).map((a) => a.key)

const needle = 'data-plan-price="999"'
const needle2 = "data-plan-price='999'"
const needle3 = 'data-plan-price=\\"999\\"'
const hits = []

for (const key of keys) {
  if (!/\.(liquid|js|css)$/i.test(key)) continue
  if (!/hide|fab|floating|login|layout|header|tap|plan|offer|conversion|theme|snippet|section/i.test(key)) {
    continue
  }
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  const value = json.asset?.value || ''
  if (!value.includes('999')) continue
  if (!/display:\s*none/i.test(value)) continue
  if (
    value.includes(needle) ||
    value.includes(needle2) ||
    value.includes('data-plan-price="999"') ||
    /data-plan-price=.999/.test(value)
  ) {
    const m = value.match(/[\s\S]{0,160}data-plan-price[\s\S]{0,220}display:\s*none[\s\S]{0,80}/i)
      || value.match(/[\s\S]{0,120}data-plan-price=.?999[\s\S]{0,250}/)
    hits.push({ key, snippet: (m?.[0] || '').replace(/\s+/g, ' ').slice(0, 400) })
  }
}

console.log(JSON.stringify(hits, null, 2))
