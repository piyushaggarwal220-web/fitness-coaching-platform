/**
 * Remove layout talk-form override that hid the page template section
 * and injected the old form. Draft theme only.
 */
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

const j = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())

let layout = j.asset.value
const start = '{%- comment -%} lurvox-talk-form-override-v1 {%- endcomment -%}'
const end = '{%- comment -%} /lurvox-talk-form-override-v1 {%- endcomment -%}'
const a = layout.indexOf(start)
const b = layout.indexOf(end)
if (a < 0 || b < 0) {
  console.error('override markers not found', { a, b })
  process.exit(1)
}
layout = layout.slice(0, a) + layout.slice(b + end.length)
console.log('removed override bytes', b + end.length - a)

// Also ensure talk-coach handle pages aren't hijacked by any leftover
layout = layout.replace(
  /#MainContent \.shopify-section \{ display: none !important; \}/g,
  '/* lurvox: do not hide page sections */'
)

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
      files: [
        {
          filename: 'layout/theme.liquid',
          body: { type: 'TEXT', value: layout },
        },
      ],
    },
  }),
}).then((r) => r.json())

if (upsert.errors) throw new Error(JSON.stringify(upsert.errors))
console.log(JSON.stringify(upsert.data.themeFilesUpsert, null, 2))

// verify
const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent('layout/theme.liquid')}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
).then((r) => r.json())
const v = verify.asset.value
console.log({
  hasOverride: v.includes('lurvox-talk-form-override-v1'),
  hasOldForm: v.includes('lurvox-talk-coach__form'),
  hasHowCanWeHelp: v.includes('How can we help'),
  hasWaPathRedirect: /window\.location\.replace\(\s*["']https:\/\/wa\.me/i.test(v),
})
