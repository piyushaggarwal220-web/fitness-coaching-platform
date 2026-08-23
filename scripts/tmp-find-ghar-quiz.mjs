import fs from 'node:fs'
import path from 'node:path'

const htmlRes = await fetch('https://www.lurvox.in/pages/find-your-plan?v=' + Date.now(), {
  headers: { 'Cache-Control': 'no-cache' },
})
const html = await htmlRes.text()
const i = html.toLowerCase().indexOf('ghar')
console.log('html snippet', JSON.stringify(html.slice(Math.max(0, i - 80), i + 140)))

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

async function get(key) {
  const res = await fetch(
    `${API}/themes/161454620923/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  return (await res.json()).asset.value
}

const val = await get('sections/lurvox-plan-finder.liquid')
console.log('api has Ghar', /ghar/i.test(val))
console.log('api has Home cooked', /Home cooked food\. Keep it simple/.test(val))
const t = await get('templates/page.find-your-plan.json')
console.log('template ghar', /ghar/i.test(t))
