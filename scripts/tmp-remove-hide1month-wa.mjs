/**
 * Remove lurvox-talk-wa-force-v1 from lurvox-hide-1month.liquid on draft theme.
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
const KEY = 'sections/lurvox-hide-1month.liquid'
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

let src = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)

const start = '{% comment %} lurvox-talk-wa-force-v1 {% endcomment %}'
const a = src.indexOf(start)
if (a < 0) {
  // try alternate comment format
  console.log('exact start missing, stripping WA force scripts')
} else {
  // remove from comment through following script tag
  const scriptStart = src.indexOf('<script>', a)
  const scriptEnd = src.indexOf('</script>', scriptStart)
  if (scriptStart > 0 && scriptEnd > scriptStart) {
    src =
      src.slice(0, a) +
      '<!-- lurvox-talk-wa-force-v1 removed: keep consult on-site -->\n' +
      src.slice(scriptEnd + '</script>'.length)
  }
}

src = src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
  if (/wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(block)) {
    return '<!-- lurvox: removed WA talk force script -->'
  }
  return block
})

console.log('still has WA force?', /wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(src))

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
      files: [{ filename: KEY, body: { type: 'TEXT', value: src } }],
    },
  }),
}).then((r) => r.json())
console.log(JSON.stringify(upsert.data?.themeFilesUpsert || upsert.errors, null, 2))

const verify = await fetch(
  `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(KEY)}&t=${Date.now()}`,
  { headers: { 'X-Shopify-Access-Token': token } }
)
  .then((r) => r.json())
  .then((j) => j.asset.value)
console.log({
  hasWaForce: /wa\.me\/919220451577\?text=i%20want%20a%20free%20consultation/i.test(verify),
  hasVarWA: verify.includes('var WA='),
})
