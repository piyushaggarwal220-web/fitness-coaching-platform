import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = 161429127419
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const key = 'blocks/ai_gen_block_361650c.liquid'
const res = await fetch(
  `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
let v = (await res.json()).asset?.value || ''
if (!v) throw new Error('missing plan block')

const hasPlans = v.includes('id="plans"') || v.includes("id='plans'")
console.log('hasPlans', hasPlans)

if (!hasPlans) {
  // Anchor for #plans CTAs — wrap first outer element or inject before root
  if (v.includes('<fitness-') || v.includes('<div class="ai-transformation')) {
    v = v.replace(
      /(<fitness-[^>]+>|<div class="ai-transformation[^"]*"[^>]*>)/,
      '<div id="plans"></div>\n$1'
    )
  } else {
    v = `<div id="plans"></div>\n` + v
  }
  const put = await fetch(`${REST}/themes/${THEME}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value: v } }),
  })
  const json = await put.json()
  if (!put.ok || json.errors) throw new Error(JSON.stringify(json).slice(0, 400))
  console.log('added id=plans')
}

// Also ensure hero CTA stays visible in first viewport via sticky already present.
console.log('ok')
