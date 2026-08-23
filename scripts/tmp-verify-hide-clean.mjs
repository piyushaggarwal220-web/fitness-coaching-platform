import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const H = { 'X-Shopify-Access-Token': token }
const id = 161391804667
const j = await (
  await fetch(`${REST}/themes/${id}/assets.json?asset[key]=assets/lurvox-hide-1month.js`, {
    headers: H,
  })
).json()
const v = j.asset.value
console.log({
  len: v.length,
  hasInjectAssign: /label\.textContent\s*=\s*['"]Price increases/i.test(v),
  hasFixPlan: /function fixPlanTimer/.test(v),
  hasDisabled: /disabled — SALE ENDS IN/.test(v),
  hasPhrase: /Price increases in/i.test(v),
})
