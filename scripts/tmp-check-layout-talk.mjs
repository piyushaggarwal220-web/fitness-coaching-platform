import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

const keys = [
  'layout/theme.liquid',
  'sections/footer-group.json',
  'sections/header-group.json',
  'sections/utilities.liquid',
  'sections/main-page.liquid',
  'sections/page.liquid',
  'snippets/css-variables.liquid',
]

for (const key of keys) {
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  const v = j.asset?.value
  if (!v) {
    console.log(key, 'MISSING')
    continue
  }
  console.log(key, {
    howCanWeHelp: v.includes('How can we help'),
    oldForm: v.includes('lurvox-talk-coach__form'),
    talkToCoach: (v.match(/Talk to a coach/g) || []).length,
    inject: /talk-to-a-coach|talk-coach/.test(v),
  })
  if (v.includes('How can we help') || v.includes('lurvox-talk-coach__form')) {
    const i = v.indexOf('How can we help')
    const j2 = v.indexOf('lurvox-talk-coach')
    const at = i >= 0 ? i : j2
    console.log('context', v.slice(Math.max(0, at - 120), at + 200))
  }
}
