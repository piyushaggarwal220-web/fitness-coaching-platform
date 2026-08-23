/**
 * Probe header-group + client-login on draft + main themes.
 */
import fs from 'node:fs'
import path from 'node:path'

const SHOP = '9uwyq1-0j.myshopify.com'
const API = `https://${SHOP}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

async function get(themeId, key) {
  const res = await fetch(
    `${API}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  if (!res.ok) return null
  const j = await res.json()
  return j.asset?.value ?? null
}

const themesRes = await fetch(`${API}/themes.json`, { headers })
const themes = (await themesRes.json()).themes
console.log(
  'themes',
  themes.map((t) => ({ id: t.id, role: t.role, name: t.name.slice(0, 50) }))
)

const main = themes.find((t) => t.role === 'main')
const draft = themes.find((t) => t.id === 161454620923)

for (const t of [draft, main].filter(Boolean)) {
  console.log('\n===', t.id, t.role, t.name.slice(0, 40))
  const hg = await get(t.id, 'sections/header-group.json')
  if (!hg) {
    console.log('no header-group')
    continue
  }
  const parsed = JSON.parse(hg)
  console.log('order', parsed.order)
  for (const id of parsed.order || []) {
    const s = parsed.sections?.[id]
    console.log(' -', id, s?.type, s?.settings?.label || s?.settings?.login_label || '')
  }
  const cl = await get(t.id, 'sections/lurvox-client-login.liquid')
  console.log('client-login asset', !!cl, cl ? cl.length : 0)
  const offer = await get(t.id, 'sections/lurvox-offer-home.liquid')
  if (offer) {
    console.log(
      'offer hides login?',
      /lurvox-client-login[\s\S]{0,120}display:\s*none/.test(offer)
    )
  }
}
