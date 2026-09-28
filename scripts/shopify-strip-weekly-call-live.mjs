/**
 * Replace weekly-call sales copy on the live LURVOX theme.
 * Uses SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET. Does not print tokens.
 */
import fs from 'node:fs'
import path from 'node:path'

const shop = (process.env.SHOPIFY_SHOP || '').replace(/\.myshopify\.com$/i, '').trim()
const clientId = process.env.SHOPIFY_CLIENT_ID?.trim() || ''
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || ''
const apiVersion = process.env.SHOPIFY_API_VERSION?.trim() || '2025-01'
if (!shop || !clientId || !clientSecret) {
  throw new Error('Missing SHOPIFY_SHOP, SHOPIFY_CLIENT_ID, or SHOPIFY_CLIENT_SECRET')
}

const tokenRes = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }),
})
const tokenJson = await tokenRes.json().catch(() => ({}))
if (!tokenRes.ok || !tokenJson.access_token) {
  throw new Error(`Shopify auth failed (${tokenRes.status})`)
}
const token = tokenJson.access_token
const REST = `https://${shop}.myshopify.com/admin/api/${apiVersion}`
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themesRes = await fetch(`${REST}/themes.json`, { headers })
const themesJson = await themesRes.json().catch(() => ({}))
const themes = themesJson.themes || []
console.log('themes status', themesRes.status, 'count', themes.length, 'roles', themes.map((theme) => theme.role).join(',') || 'none')
if (!themesRes.ok) throw new Error(`themes.json ${themesRes.status}`)
const main = themes.find((theme) => theme.role === 'main')
if (!main) throw new Error('No published theme')
console.log('theme', main.id, main.name)

async function getAsset(key) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}`, {
    headers,
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`get ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? null
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`put ${key} ${res.status} ${body.slice(0, 240)}`)
  }
  console.log('updated', key)
}

const replacements = [
  ['Weekly phone calls are 12-month only.', 'No coach phone call on any plan.'],
  ['Weekly phone call on 12 months only.', 'Coaching stays in the app. No coach phone call.'],
  ['Includes a weekly coach phone call', '12 months. No coach phone call.'],
  ['Weekly coach phone call is 12-month only. 3 and 6 month plans still include coach chat and check-ins.', 'Coaching stays in the app on every plan. No coach phone call.'],
  ['with a weekly coach phone call included.', 'Coaching stays in the app. No coach phone call.'],
  ['with a weekly coach phone call.', 'Coaching stays in the app. No coach phone call.'],
  ["'Weekly coach phone call included'", "'Weekly plan updates'"],
  ['Do you want a weekly coach phone call?', 'How do you want coaching day to day?'],
  ['Yes. Call me every week', 'In the app, with weekly plan updates'],
  ['Maybe, if it is part of the plan', 'App chat and check-ins are enough'],
  [">Weekly call<", '>Not included<'],
]

const localFiles = [
  ['sections/lurvox-plan-compare.liquid', 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'],
  ['sections/lurvox-plan-finder.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder.liquid'],
  ['sections/lurvox-plan-finder-v3.liquid', 'scripts/shopify-assets/sections-lurvox-plan-finder-v3.liquid'],
  ['snippets/lurvox-plan-compare-inline.liquid', 'scripts/shopify-assets/snippets-lurvox-plan-compare-inline.liquid'],
  ['templates/page.compare-plans.json', 'scripts/shopify-assets/templates-page.compare-plans.json'],
  ['templates/page.compare-short.json', 'scripts/shopify-assets/templates-page.compare-short.json'],
  ['templates/page.find-your-plan.json', 'scripts/shopify-assets/templates-page.find-your-plan.json'],
]

for (const [key, file] of localFiles) {
  const full = path.join(process.cwd(), file)
  if (!fs.existsSync(full)) {
    console.log('skip missing local', file)
    continue
  }
  await putAsset(key, fs.readFileSync(full, 'utf8'))
}

const pages = (await (await fetch(`${REST}/pages.json?limit=250`, { headers })).json()).pages || []
const templateKeys = new Set(['templates/index.json'])
for (const page of pages) {
  const suffix = page.template_suffix
  templateKeys.add(suffix ? `templates/page.${suffix}.json` : 'templates/page.json')
  if (/plan|compar|coach|athletic|choose|quiz/i.test(`${page.handle} ${page.title}`)) {
    console.log('page', page.handle, suffix || '(default)')
  }
}

for (const key of templateKeys) {
  const value = await getAsset(key)
  if (!value) continue
  let next = value
  for (const [from, to] of replacements) next = next.split(from).join(to)
  if (next !== value) await putAsset(key, next)
  else if (/weekly coach phone call|Weekly phone call on 12|Call me every week/i.test(value)) {
    console.log('still mentions a call, left untouched for review:', key)
  }
}

console.log('done')
