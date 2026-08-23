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

const needle = 'wa.me/919220451577?text=i%20want%20a%20free%20consultation'
const idx = layout.indexOf(needle)
console.log('context:\n', layout.slice(Math.max(0, idx - 500), idx + 300))

// Remove any remaining script that rewrites talk CTAs to WhatsApp
const patterns = [
  /{%-?\s*comment\s*-?%}[\s\S]*?lurvox-talk[\s\S]*?{%-?\s*endcomment\s*-?%}[\s\S]*?<script>[\s\S]*?wa\.me\/919220451577[\s\S]*?<\/script>/gi,
  /<script>[\s\S]*?wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation[\s\S]*?<\/script>/gi,
]

let cleaned = layout
for (const re of patterns) cleaned = cleaned.replace(re, '<!-- lurvox-wa-talk-script-removed -->')

// Also neutralize hardcoded WA consultation replacements in JS
cleaned = cleaned.replace(
  /https:\/\/wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation%20call%20and%20more%20info/g,
  '/pages/talk-to-a-coach'
)

console.log('changed', cleaned !== layout)
console.log('remaining wa consult', cleaned.includes(needle))

if (cleaned !== layout) {
  const res = await fetch(GQL, {
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
  console.log(JSON.stringify(res.data?.themeFilesUpsert || res.errors, null, 2))
}
