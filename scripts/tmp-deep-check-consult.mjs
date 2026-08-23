import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = 161294057723
const headers = { 'X-Shopify-Access-Token': token }

const section = await (
  await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('sections/lurvox-talk-to-coach.liquid')}&t=${Date.now()}`,
    { headers }
  )
).json()

const v = section.asset.value
const needles = [
  'Talk to a coach',
  'How can we help',
  'lx-consult',
  'Book a free consultation',
  '₹2,499',
  'lurvox-talk-coach__form',
  'Send message',
  'Request free consultation',
]
for (const n of needles) {
  console.log(n, v.includes(n))
}

// List all section assets containing talk
const list = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, { headers }).then((r) =>
  r.json()
)
const talkAssets = (list.assets || [])
  .map((a) => a.key)
  .filter((k) => /talk|consult/i.test(k))
console.log('talk assets', talkAssets)

const pages = await fetch('https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `{
      pages(first: 20, query: "handle:talk*") {
        nodes { id handle title templateSuffix body }
      }
    }`,
  }),
}).then((r) => r.json())
console.log('pages', JSON.stringify(pages, null, 2).slice(0, 3000))
