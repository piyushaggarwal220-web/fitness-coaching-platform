import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

const list = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, { headers }).then((r) =>
  r.json()
)
const keys = (list.assets || []).map((a) => a.key)

const interesting = []
for (const key of keys) {
  if (!/\.(liquid|json)$/.test(key)) continue
  if (/locales|config\/settings_data|templates\/product|templates\/collection/.test(key)) continue
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers }
  ).then((r) => r.json())
  const v = j.asset?.value || ''
  if (
    /How can we help|lurvox-talk-coach__form|Talk to a coach|Send message/.test(v) &&
    !key.includes('lurvox-talk-to-coach')
  ) {
    interesting.push({
      key,
      hits: [
        v.includes('How can we help') && 'How can we help',
        v.includes('lurvox-talk-coach__form') && 'old form class',
        v.includes('Talk to a coach') && 'Talk to a coach',
        v.includes('Send message') && 'Send message',
        v.includes('lx-consult') && 'lx-consult',
      ].filter(Boolean),
    })
  }
}
console.log(JSON.stringify(interesting, null, 2))
