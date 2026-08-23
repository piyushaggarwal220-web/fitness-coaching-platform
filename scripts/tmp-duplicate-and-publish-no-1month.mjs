/**
 * Duplicate main theme (bakes current Asset API state), verify hide block,
 * then publish the duplicate as MAIN so storefront picks it up.
 */
import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('current main', main.id, main.name)

// Ensure hide block + section exist on main before duplicate
async function get(themeId, key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset
}

const index = JSON.parse((await get(main.id, 'templates/index.json')).value)
console.log(
  'main index has hide block',
  !!index.sections?.home_blocks_v2?.blocks?.lurvox_hide_1month_block
)
console.log(
  'main has hide section file',
  !!(await get(main.id, 'sections/lurvox-hide-1month.liquid'))?.value
)
console.log(
  'main has hide block file',
  !!(await get(main.id, 'blocks/lurvox-hide-1month.liquid'))?.value
)

// Duplicate via GraphQL
const dupName = `LURVOX No 1-Month ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
let dup
try {
  dup = await gql(
    `mutation themeDuplicate($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: `gid://shopify/OnlineStoreTheme/${main.id}`, name: dupName }
  )
  console.log('themeDuplicate', JSON.stringify(dup.themeDuplicate, null, 2))
} catch (e) {
  console.log('themeDuplicate failed', e.message)
  // Fallback: REST copy isn't available; try publish-in-place
  dup = null
}

let newThemeId = dup?.themeDuplicate?.newTheme?.id?.split('/')?.pop()

if (!newThemeId) {
  console.log('Falling back to re-publish current main')
  newThemeId = String(main.id)
} else {
  // Wait for duplicate assets
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    try {
      const idx = JSON.parse((await get(newThemeId, 'templates/index.json')).value)
      const has =
        !!idx.sections?.home_blocks_v2?.blocks?.lurvox_hide_1month_block ||
        !!idx.sections?.lurvox_hide_1month
      console.log('dup wait', i, 'has hide', has)
      if (has) break
    } catch (e) {
      console.log('dup wait', i, e.message)
    }
  }
}

// Publish
const pub = await gql(
  `mutation themePublish($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { field message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${newThemeId}` }
)
console.log('published', JSON.stringify(pub.themePublish, null, 2))

// Also REST role=main
const restPub = await fetch(`${REST}/themes/${newThemeId}.json`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({ theme: { id: Number(newThemeId), role: 'main' } }),
})
console.log('REST publish', restPub.status, (await restPub.text()).slice(0, 300))

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const plans = await fetch(`https://www.lurvox.in/pages/plans?cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const preview = await fetch(
    `https://9uwyq1-0j.myshopify.com/?preview_theme_id=${newThemeId}&cb=${Date.now()}-${i}`,
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' } }
  ).then((r) => r.text())

  const result = {
    homeHide: html.includes('lurvox-hide-1month-style') || html.includes('data-lurvox-hide-1month'),
    previewHide:
      preview.includes('lurvox-hide-1month-style') || preview.includes('data-lurvox-hide-1month'),
    plansStamp: plans.includes('lurvox-plans-no-1month'),
    plansExact1: /(?<!\d)1 Month/.test(plans),
    cdnTheme: (html.match(/\/cdn\/shop\/t\/(\d+)\//) || [])[1],
  }
  console.log(i, result)
  if (result.homeHide && result.plansStamp && !result.plansExact1) {
    console.log('SUCCESS')
    break
  }
  if (result.previewHide && !result.homeHide) {
    console.log('preview has hide but live does not yet')
  }
}
