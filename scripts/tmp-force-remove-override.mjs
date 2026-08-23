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

async function getLayout() {
  const j = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=layout/theme.liquid&t=${Date.now()}`,
    { headers: { 'X-Shopify-Access-Token': token } }
  ).then((r) => r.json())
  return j.asset.value
}

let layout = await getLayout()
const start = '{%- comment -%} lurvox-talk-form-override-v1 {%- endcomment -%}'
const end = '{%- comment -%} /lurvox-talk-form-override-v1 {%- endcomment -%}'

console.log('occurrences start', layout.split(start).length - 1)
console.log('occurrences end', layout.split(end).length - 1)
console.log('len before', layout.length)

while (layout.includes(start) && layout.includes(end)) {
  const a = layout.indexOf(start)
  const b = layout.indexOf(end)
  if (b < a) break
  layout = layout.slice(0, a) + '<!-- lurvox-talk-form-override-removed -->\n' + layout.slice(b + end.length)
}

// Nuclear: if old form class still present, strip from comment to endcomment pair by regex
if (layout.includes('lurvox-talk-coach__form') || layout.includes('lurvox-talk-form-override')) {
  layout = layout.replace(
    /{%-?\s*comment\s*-?%}\s*lurvox-talk-form-override-v1\s*{%-?\s*endcomment\s*-?%}[\s\S]*?{%-?\s*comment\s*-?%}\s*\/lurvox-talk-form-override-v1\s*{%-?\s*endcomment\s*-?%}/g,
    '<!-- lurvox-talk-form-override-removed -->'
  )
}

console.log('len after', layout.length)
console.log('still has old form', layout.includes('lurvox-talk-coach__form'))
console.log('still has override marker', layout.includes('lurvox-talk-form-override-v1'))

// REST put
const restPut = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ asset: { key: 'layout/theme.liquid', value: layout } }),
}).then((r) => r.json())
console.log('REST put errors', restPut.errors || null, 'key', restPut.asset?.key)

// GraphQL upsert
const gqlPut = await fetch(GQL, {
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
      files: [{ filename: 'layout/theme.liquid', body: { type: 'TEXT', value: layout } }],
    },
  }),
}).then((r) => r.json())
console.log('GQL', JSON.stringify(gqlPut.data?.themeFilesUpsert || gqlPut.errors, null, 2))

await new Promise((r) => setTimeout(r, 2000))
const verify = await getLayout()
console.log({
  verifyLen: verify.length,
  hasOverride: verify.includes('lurvox-talk-form-override-v1'),
  hasOldForm: verify.includes('lurvox-talk-coach__form'),
  hasRemovedMarker: verify.includes('lurvox-talk-form-override-removed'),
  hasHowCanWeHelp: verify.includes('How can we help'),
})

fs.writeFileSync(path.join(process.env.TEMP, 'draft-layout-cleaned.liquid'), layout)
