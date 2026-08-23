import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01`
const THEME_ID = '161294057723'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const H = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
}

async function get(key) {
  const r = await fetch(
    `${API}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers: H }
  )
  const j = await r.json()
  return j.asset?.value ?? null
}

async function put(key, value) {
  const r = await fetch(`${API}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', key)
}

// Harden the hide section so trial can't reappear from stale markup
const hideLiquid = `{% comment %} lurvox-hide-trial-and-1month-v1 {% endcomment %}
<style id="lurvox-hide-1month-style">
  [data-plan-index="1"],
  [data-plan-price="179"],
  [data-plan-price="999"],
  [data-plan-price="499"],
  [data-plan-link*="trial"],
  [data-plan-link*="1_week_trial"] {
    display: none !important;
  }
</style>
{% schema %}
{
  "name": "LURVOX hide 1-month",
  "settings": [],
  "presets": [{ "name": "LURVOX hide 1-month" }]
}
{% endschema %}
`
await put('sections/lurvox-hide-1month.liquid', hideLiquid)

// Probe storefront
await new Promise((r) => setTimeout(r, 2000))
const html = await (
  await fetch(`https://www.lurvox.in/?notrial=${Date.now()}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
      'Cache-Control': 'no-cache',
    },
  })
).text()

const themeId = html.match(/"id":(\d+),"schema_name"/)?.[1]
console.log(
  JSON.stringify(
    {
      servedThemeId: themeId,
      expectedThemeId: THEME_ID,
      has7DayTrialLabel: html.includes('7-DAY TRIAL'),
      has179PriceAttr: html.includes('data-plan-price="179"'),
      hasTrialCardSection: html.includes('7-Day All-Access Trial'),
      hasStartTrialLink: /Start 7-day trial/i.test(html),
      planIndexes: [...html.matchAll(/data-plan-index="(\d)"/g)].map((m) => m[1]),
      planPrices: [...html.matchAll(/data-plan-price="([^"]+)"/g)].map((m) => m[1]),
    },
    null,
    2
  )
)
