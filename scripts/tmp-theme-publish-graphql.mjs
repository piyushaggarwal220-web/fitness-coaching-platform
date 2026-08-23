import fs from 'node:fs'
import path from 'node:path'

const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themeGid = 'gid://shopify/OnlineStoreTheme/161112981755'

const res = await fetch(API, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themePublish($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { field message }
      }
    }`,
    variables: { id: themeGid },
  }),
})
const json = await res.json()
console.log(JSON.stringify(json, null, 2))

const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

for (let i = 1; i <= 10; i += 1) {
  await new Promise((r) => setTimeout(r, 6000))
  const r = await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, {
    headers: UA,
    redirect: 'follow',
  })
  const html = await r.text()
  console.log(
    JSON.stringify({
      attempt: i,
      bytes: html.length,
      shopifyThemeId: (() => {
        const m = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
        try {
          return m ? JSON.parse(m[1]).id : null
        } catch {
          return null
        }
      })(),
      talk: html.includes('lurvox-mobile-talk-cta-v1'),
      planCards: html.includes('lurvox-mobile-plan-cards-v1'),
      hideRadios: html.includes('lurvox-hide-plan-radios-v1'),
    })
  )
  if (html.includes('lurvox-mobile-talk-cta-v1')) {
    console.log('FIXES NOW LIVE')
    break
  }
}
