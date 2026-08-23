import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const THEME = 161454620923

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  )
  return (await res.json()).asset?.value
}

const listed = await fetch(`${REST}/themes/${THEME}/assets.json`, {
  headers: { 'X-Shopify-Access-Token': token },
})
const keys = ((await listed.json()).assets || []).map((a) => a.key)
const localeHits = []
for (const key of keys.filter((k) => k.startsWith('locales/'))) {
  const v = await get(key)
  if (v && /ghar|khana/i.test(v)) localeHits.push(key)
}
console.log('locale hits', localeHits)

let settings = await get('config/settings_data.json')
if (!settings) throw new Error('no settings_data')
if (!settings.endsWith('\n')) settings += '\n'
else settings += ' '

const gqlRes = await fetch(GQL, {
  method: 'POST',
  headers: H,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: `gid://shopify/OnlineStoreTheme/${THEME}`,
      files: [
        { filename: 'config/settings_data.json', body: { type: 'TEXT', value: settings } },
      ],
    },
  }),
})
const json = await gqlRes.json()
console.log(JSON.stringify(json.data?.themeFilesUpsert || json.errors, null, 2))

await new Promise((r) => setTimeout(r, 10000))
const html = await (
  await fetch('https://www.lurvox.in/pages/find-your-plan?cb=' + Date.now(), {
    headers: { 'User-Agent': 'Mozilla/5.0 verify' },
  })
).text()
console.log({
  ghar: /Ghar ka khana/.test(html),
  homeCooked: /Home cooked food\. Keep it simple/.test(html),
  busts: html.match(/lurvox-cache-bust [^<]+/g),
})
