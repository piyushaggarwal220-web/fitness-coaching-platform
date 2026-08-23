/**
 * Bake plan-compare into a fresh published theme (Asset API index.json
 * changes only stick after duplicate/publish on this store).
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

async function get(themeId, key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('current main', main.id, main.name)

const index = JSON.parse(await get(main.id, 'templates/index.json'))
console.log('has compare section', !!index.sections?.lurvox_plan_compare, index.order)
console.log(
  'has compare section file',
  !!(await get(main.id, 'sections/lurvox-plan-compare.liquid'))
)

const name = `LURVOX Plan Compare ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
const dup = await gql(
  `mutation($id:ID!,$name:String){
    themeDuplicate(id:$id,name:$name){
      newTheme{id name role}
      userErrors{message}
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${main.id}`, name }
)
console.log('duplicate', JSON.stringify(dup.themeDuplicate))
const newId = dup.themeDuplicate.newTheme.id.split('/').pop()

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  try {
    const idx = JSON.parse(await get(newId, 'templates/index.json'))
    const ok = !!idx.sections?.lurvox_plan_compare
    console.log('wait', i, 'has compare', ok)
    if (ok) break
  } catch (e) {
    console.log('wait', i, e.message)
  }
}

const pub = await gql(
  `mutation($id:ID!){ themePublish(id:$id){ theme{id name role} userErrors{message}}}`,
  { id: `gid://shopify/OnlineStoreTheme/${newId}` }
)
console.log('published', JSON.stringify(pub.themePublish))

for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  const ids = [...view.matchAll(/id="shopify-section-([^"]+)"/g)].map((m) => m[1])
  console.log(i, {
    hasCompare: view.includes('lx-plan-compare') || view.includes('lurvox_plan_compare'),
    hasPrize: view.includes('Crazy League'),
    ids: ids.filter((id) => /plan|compare|hide|home_blocks|cd3c949/i.test(id)),
  })
  if (view.includes('lx-plan-compare') || view.includes('Crazy League +')) {
    console.log('SUCCESS — compare table on fresh theme')
    break
  }
}
