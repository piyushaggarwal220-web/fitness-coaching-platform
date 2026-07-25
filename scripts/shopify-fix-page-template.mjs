/**
 * Fix default page template: enable page body, remove plan selector.
 * Policy pages were showing plans because main-page was disabled.
 */
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'

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

function strip(content) {
  return content.replace(/^\/\*[\s\S]*?\*\//, '').trim()
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

const files = await gql(
  `query ($id: ID!) {
    theme(id: $id) {
      files(filenames: ["templates/page.json"]) {
        nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: main.id }
)

const page = JSON.parse(strip(files.theme.files.nodes[0].body.content))

// Enable the real page content
if (page.sections.main) {
  page.sections.main.disabled = false
}

// Remove plan selector from ALL default pages
for (const [id, section] of Object.entries(page.sections)) {
  if (
    id !== 'main' &&
    (section.name === 'Plan selector' ||
      Object.values(section.blocks || {}).some(
        (b) => b.type === 'ai_gen_block_361650c' || b.settings?.plan_1_price
      ))
  ) {
    delete page.sections[id]
  }
}
page.order = Object.keys(page.sections)

// Keep a dedicated plans template so /pages/plans can still show the selector if desired
const plansTemplate = {
  sections: {
    main: {
      type: 'main-page',
      blocks: {
        heading: {
          type: 'text',
          name: 'Title',
          settings: {
            text: '<h1>{{ closest.page.title }}</h1>',
            width: '100%',
            max_width: 'normal',
            alignment: 'left',
            type_preset: 'h2',
            font: 'var(--font-primary--family)',
            font_size: '',
            line_height: 'normal',
            letter_spacing: 'normal',
            case: 'none',
            wrap: 'pretty',
            color: '',
            background: false,
            background_color: '#00000026',
            corner_radius: 0,
            'padding-block-start': 0,
            'padding-block-end': 0,
            'padding-inline-start': 0,
            'padding-inline-end': 0,
          },
          blocks: {},
        },
        'page-content': {
          type: 'page-content',
          settings: {},
          blocks: {},
        },
      },
      block_order: ['heading', 'page-content'],
      disabled: false,
      settings: {
        content_direction: 'column',
        gap: 32,
        color_scheme: '',
        'padding-block-start': 40,
        'padding-block-end': 80,
      },
    },
  },
  order: ['main'],
}

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [
      {
        filename: 'templates/page.json',
        body: { type: 'TEXT', value: JSON.stringify(page, null, 2) },
      },
      {
        filename: 'templates/page.policy.json',
        body: { type: 'TEXT', value: JSON.stringify(plansTemplate, null, 2) },
      },
    ],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}
console.log('Upserted', upsert.themeFilesUpsert.upsertedThemeFiles)

// Assign policy pages explicitly to policy template (and ensure published)
const allPages = await gql(`{ pages(first: 50) { nodes { id handle title templateSuffix } } }`)
const policyHandles = new Set([
  'privacy-policy',
  'terms-and-conditions',
  'refund-and-cancellation-policy',
  'shipping-policy',
  'about-us',
  'pricing',
  // contact keeps page.contact template (has form layout)
])

for (const p of allPages.pages.nodes) {
  if (!policyHandles.has(p.handle)) continue
  const result = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { id handle templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      id: p.id,
      page: {
        templateSuffix: 'policy',
        isPublished: true,
      },
    }
  )
  if (result.pageUpdate.userErrors?.length) {
    console.warn(p.handle, result.pageUpdate.userErrors)
  } else {
    console.log('Set template policy for', p.handle)
  }
}

console.log('Done. Verify https://www.lurvox.in/pages/privacy-policy')
