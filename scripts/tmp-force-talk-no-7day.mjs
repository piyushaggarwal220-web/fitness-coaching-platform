import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const GQL = `${REST}/graphql.json`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const liquid = fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'tmp-live-talk', 'sections__lurvox-talk-to-coach.liquid'),
  'utf8'
)

async function gql(query, variables) {
  const r = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors, null, 2))
  return j.data
}

async function put(themeId, key, value) {
  const r = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const j = await r.json()
  if (!r.ok || j.errors) throw new Error(`${themeId} ${key}: ${JSON.stringify(j).slice(0, 300)}`)
  console.log('updated', themeId, key)
}

const themes = await (await fetch(`${REST}/themes.json`, { headers })).json()
const main = themes.themes.find((t) => t.role === 'main')
const candidates = [String(main.id), '161389281531', '161375289595']
  .filter((v, i, a) => a.indexOf(v) === i)

for (const id of candidates) {
  const exists = themes.themes.some((t) => String(t.id) === id)
  if (!exists) {
    console.log('skip missing', id)
    continue
  }
  await put(id, 'sections/lurvox-talk-to-coach.liquid', liquid)

  // GraphQL upsert for stronger compile invalidate
  await gql(
    `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }`,
    {
      themeId: `gid://shopify/OnlineStoreTheme/${id}`,
      files: [
        {
          filename: 'sections/lurvox-talk-to-coach.liquid',
          body: { type: 'TEXT', value: liquid },
        },
      ],
    }
  )
  console.log('upserted', id)
}

// republish main
await gql(
  `mutation($id: ID!) {
    themePublish(id: $id) {
      theme { id name role }
      userErrors { message }
    }
  }`,
  { id: `gid://shopify/OnlineStoreTheme/${main.id}` }
)
console.log('republished', main.id)

const urls = [
  `https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`,
  `https://www.lurvox.in/pages/talk-to-a-coach?view=&v=${Date.now()}`,
  `https://www.lurvox.in/pages/talk-to-a-coach?preview_theme_id=${main.id}&v=${Date.now()}`,
]

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const url of urls) {
    const html = await (
      await fetch(`${url}&i=${i}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/126 Mobile',
          'Cache-Control': 'no-cache',
        },
      })
    ).text()
    const state = {
      url: url.includes('preview') ? 'preview' : url.includes('view=') ? 'view' : 'default',
      themeId: html.match(/"id":(\d+),"schema_name"/)?.[1],
      has7Day: /7-Day Trial|7-Day All-Access Trial/i.test(html),
      has179: /₹179|Rs\s*179/i.test(html),
      has3m: /3 Months/i.test(html),
    }
    console.log(i, JSON.stringify(state))
    if (!state.has7Day && !state.has179 && state.has3m) {
      console.log('SUCCESS on', state.url)
      process.exit(0)
    }
  }
}

console.log('updated on themes; storefront cache may need Theme Editor Save')
