import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const THEME_ID = 161294057723
const THEME_GID = 'gid://shopify/OnlineStoreTheme/161294057723'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

let layout = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

const matches = [...layout.matchAll(/lurvox-layout-talk-wa-v1|wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/g)]
console.log(
  matches.map((m) => ({
    match: m[0],
    around: layout.slice(Math.max(0, m.index - 80), m.index + 120).replace(/\s+/g, ' '),
  }))
)

// Strip ALL script blocks that contain the WA consultation URL
let cleaned = layout.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
  if (/wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(block)) {
    return '<!-- lurvox: removed WA talk force script -->'
  }
  return block
})

// Also neutralize in hide-1month asset if it rewrites anchors
console.log('scripts removed?', cleaned !== layout)
console.log(
  'cleaned still has WA consult script?',
  /<script[\s\S]*wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(cleaned)
)

if (!cleaned.includes('{{ content_for_header }}') && !cleaned.includes('{{content_for_header}}')) {
  // Horizon may use {{ content_for_header }} with spaces variants
  console.log('header token check', {
    spaced: cleaned.includes('content_for_header'),
  })
}

const upsert = await fetch(GQL, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    variables: {
      themeId: THEME_GID,
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: cleaned } }],
    },
  }),
}).then((r) => r.json())
console.log(JSON.stringify(upsert.data?.themeFilesUpsert || upsert.errors, null, 2))

await new Promise((r) => setTimeout(r, 1500))
const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

console.log({
  hasActiveWaScript: /<script[\s\S]*wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(
    verify
  ),
  hasVarWA: verify.includes('var WA="https://wa.me/919220451577'),
})
