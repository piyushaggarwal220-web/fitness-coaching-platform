import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const token = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8'))
const themeId = 'gid://shopify/OnlineStoreTheme/161112981755'
const numericThemeId = '161112981755'

const sectionLiquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)

const pageTemplate = `${JSON.stringify(
  {
    sections: {
      main: {
        type: 'lurvox-talk-to-coach',
        settings: {
          heading: 'Talk to a coach',
          subheading:
            'Free consultation — share your goals and we will help you decide if LURVOX is the right fit.',
          button_label: 'Send message',
          accent_color: '#FF6200',
        },
      },
    },
    order: ['main'],
  },
  null,
  2
)}\n`

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

async function restUpsert(key, value) {
  const response = await fetch(`https://${STORE}/admin/api/2025-01/themes/${numericThemeId}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!response.ok) throw new Error(`REST ${key} failed: ${await response.text()}`)
}

await restUpsert('sections/lurvox-talk-to-coach.liquid', sectionLiquid)
await restUpsert('templates/page.talk-to-a-coach.json', pageTemplate)

const verify = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {
    id: themeId,
    filenames: ['sections/lurvox-talk-to-coach.liquid', 'templates/page.talk-to-a-coach.json'],
  }
)

for (const node of verify.theme.files.nodes) {
  const content = node.body?.content || ''
  console.log(node.filename, {
    len: content.length,
    hasForm: content.includes('lurvox-talk-coach__form'),
    hasSectionType: content.includes('lurvox-talk-to-coach'),
  })
}

const html = await (await fetch(`https://www.lurvox.in/pages/talk-to-a-coach?v=${Date.now()}`)).text()
console.log('storefront', {
  hasForm: html.includes('lurvox-talk-coach__form'),
  hasApi: html.includes('app.lurvox.in/api/public/talk-to-a-coach'),
  hasContactForm: html.includes('contact'),
})
