import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const themeId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

const keys = [
  'assets/base.css',
  'snippets/lurvox-hide-1month.liquid',
  'sections/lurvox-hide-1month.liquid',
  'sections/lurvox-client-login.liquid',
  'layout/theme.liquid',
  'sections/header-group.json',
  'sections/footer-group.json',
  'templates/index.json',
]

for (const key of keys) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  )
  const json = await res.json()
  if (!res.ok) {
    console.log('missing', key)
    continue
  }
  const v = json.asset.value
  const hasHide = /lurvox-hide-1month|data-plan-price=.999|data-plan-index=.1./.test(v)
  console.log('---', key, 'len', v.length, 'hasHideish', hasHide)
  if (hasHide) {
    const idx = v.search(/lurvox-hide-1month|data-plan-price.?=.?999/)
    console.log(v.slice(Math.max(0, idx - 80), idx + 400).replace(/\n/g, '\\n'))
  }
}
