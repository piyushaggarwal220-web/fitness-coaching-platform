import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const themeId = 'gid://shopify/OnlineStoreTheme/161112981755'

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

const data = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.contact.json"], first: 1) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: themeId }
)
const content = data.theme.files.nodes[0]?.body?.content || ''
console.log('theme file has lurvox', content.includes('lurvox-talk-to-coach'))
console.log('theme file has contact-form', content.includes('contact-form'))
console.log(content.slice(0, 500))

await new Promise((r) => setTimeout(r, 10000))
for (const url of [
  'https://9uwyq1-0j.myshopify.com/pages/talk-to-a-coach',
  'https://www.lurvox.in/pages/talk-to-a-coach',
]) {
  const html = await (await fetch(url + '?nocache=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })).text()
  console.log(url, {
    hasForm: html.includes('lurvox-talk-coach__form'),
    hasContact: html.includes('contact-form'),
    sectionTypes: [...html.matchAll(/shopify-section-template--\d+__([\w-]+)/g)].map((m) => m[1]).slice(0, 8),
  })
}
