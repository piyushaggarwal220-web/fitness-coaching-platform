import fs from 'node:fs'
import path from 'node:path'

const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
if (!fs.existsSync(tokenPath)) {
  console.log(JSON.stringify({ ok: false, error: 'missing shopify-auth-token.json' }))
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const token = raw.access_token
const store = '9uwyq1-0j.myshopify.com'

const response = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers: {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `{
      shop { name myshopifyDomain }
      themes(first: 50) {
        nodes { id name role updatedAt }
      }
    }`,
  }),
})

const body = await response.json()
const themes = body.data?.themes?.nodes ?? []
const needle = 'new changes'
const matches = themes.filter((t) => t.name.toLowerCase().includes(needle))

console.log(
  JSON.stringify(
    {
      ok: response.ok && !body.errors,
      httpStatus: response.status,
      shop: body.data?.shop ?? null,
      errors: body.errors ?? null,
      themeCount: themes.length,
      matches: matches.map((t) => ({
        id: t.id,
        numericId: t.id.match(/OnlineStoreTheme\/(\d+)/)?.[1] ?? null,
        name: t.name,
        role: t.role,
        updatedAt: t.updatedAt,
        previewUrl: t.id.match(/OnlineStoreTheme\/(\d+)/)
          ? `https://www.lurvox.in/?preview_theme_id=${t.id.match(/OnlineStoreTheme\/(\d+)/)[1]}`
          : null,
      })),
      themes: themes.map((t) => ({
        name: t.name,
        role: t.role,
        id: t.id,
        updatedAt: t.updatedAt,
      })),
    },
    null,
    2
  )
)
