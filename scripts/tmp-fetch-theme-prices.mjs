import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

const index = JSON.parse(
  (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=templates/index.json&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset.value
)

function findPlanSettings(node, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    node.forEach((n) => findPlanSettings(n, acc))
    return acc
  }
  if (node.settings && ('plan_1_price' in node.settings || 'plan_2_price' in node.settings)) {
    const s = node.settings
    acc.push({
      type: node.type,
      plan_1: { enabled: s.plan_1_enabled, duration: s.plan_1_duration, price: s.plan_1_price, monthly: s.plan_1_monthly },
      plan_2: { enabled: s.plan_2_enabled, duration: s.plan_2_duration, price: s.plan_2_price, monthly: s.plan_2_monthly },
      plan_3: { enabled: s.plan_3_enabled, duration: s.plan_3_duration, price: s.plan_3_price, monthly: s.plan_3_monthly },
      plan_4: { enabled: s.plan_4_enabled, duration: s.plan_4_duration, price: s.plan_4_price, monthly: s.plan_4_monthly },
    })
  }
  Object.values(node).forEach((v) => findPlanSettings(v, acc))
  return acc
}

console.log(JSON.stringify(findPlanSettings(index), null, 2))
