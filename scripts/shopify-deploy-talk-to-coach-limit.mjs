import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const SECTION_FILENAME = 'sections/lurvox-talk-to-coach.liquid'
const PAGE_TEMPLATE_FILENAME = 'templates/page.talk-to-a-coach.json'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  throw new Error('Shopify auth token not found. Run: node scripts/shopify-pkce-auth.mjs')
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/shopify-assets/sections-lurvox-talk-to-coach.liquid'),
  'utf8'
)

const pageTemplate = {
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
}

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
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

async function restUpsert(themeId, key, value) {
  const numericThemeId = themeId.split('/').pop()
  const response = await fetch(
    `https://${STORE}/admin/api/2025-01/themes/${numericThemeId}/assets.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token.access_token,
      },
      body: JSON.stringify({ asset: { key, value } }),
    }
  )
  if (!response.ok) {
    throw new Error(`REST theme upload failed (${response.status}): ${await response.text()}`)
  }
}

const storeData = await gql(`{
  shop { primaryDomain { url } }
  themes(first: 20) { nodes { id name role } }
}`)
const mainTheme = storeData.themes.nodes.find((theme) => theme.role === 'MAIN')
if (!mainTheme) throw new Error('No live MAIN theme found')

const existingTemplate = await gql(
  `query themeTalkTemplate($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  { id: mainTheme.id, filenames: [PAGE_TEMPLATE_FILENAME] }
)
const hadPageTemplate = Boolean(
  existingTemplate.theme.files.nodes.find((node) => node.filename === PAGE_TEMPLATE_FILENAME)?.body?.content
)

const filesToUpload = [
  {
    filename: SECTION_FILENAME,
    body: { type: 'TEXT', value: sectionLiquid },
  },
]

if (!hadPageTemplate) {
  filesToUpload.push({
    filename: PAGE_TEMPLATE_FILENAME,
    body: { type: 'TEXT', value: `${JSON.stringify(pageTemplate, null, 2)}\n` },
  })
}

const upload = await gql(
  `mutation deployTalkToCoach($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  { themeId: mainTheme.id, files: filesToUpload }
)

if (upload.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upload.themeFilesUpsert.userErrors, null, 2))
}

const verification = await gql(
  `query verifyTalkToCoach($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
      }
    }
  }`,
  {
    id: mainTheme.id,
    filenames: hadPageTemplate
      ? [SECTION_FILENAME]
      : [SECTION_FILENAME, PAGE_TEMPLATE_FILENAME],
  }
)

const verifiedFiles = Object.fromEntries(
  verification.theme.files.nodes.map((node) => [node.filename, node.body?.content || ''])
)
const sectionVerified = verifiedFiles[SECTION_FILENAME]?.includes('lurvox-talk-coach__form')

const destinationUrl = storeData.shop.primaryDomain.url
let storefrontVerified = false
let storefrontStatus = null
let deploymentMethod = 'GraphQL'

try {
  const response = await fetch(`${destinationUrl}/pages/talk-to-a-coach?verify=${Date.now()}`, {
    headers: { 'User-Agent': 'LURVOX theme deployment verifier' },
  })
  storefrontStatus = response.status
  const html = await response.text()
  storefrontVerified = response.ok && html.includes('lurvox-talk-coach')
} catch {}

if (!storefrontVerified) {
  await restUpsert(mainTheme.id, SECTION_FILENAME, sectionLiquid)
  if (!hadPageTemplate) {
    await restUpsert(mainTheme.id, PAGE_TEMPLATE_FILENAME, `${JSON.stringify(pageTemplate, null, 2)}\n`)
  }
  deploymentMethod = 'GraphQL + REST cache refresh'
}

console.log(
  JSON.stringify(
    {
      theme: { id: mainTheme.id, name: mainTheme.name, role: mainTheme.role },
      destinationUrl,
      talkPageUrl: `${destinationUrl}/pages/talk-to-a-coach`,
      apiUrl: 'https://app.lurvox.in/api/public/talk-to-a-coach',
      deploymentMethod,
      uploadedFiles: upload.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename),
      sectionVerified,
      hadPageTemplate,
      pageTemplateAction: hadPageTemplate
        ? `${PAGE_TEMPLATE_FILENAME} already exists — assign section type lurvox-talk-to-coach manually in theme editor if needed`
        : `Created ${PAGE_TEMPLATE_FILENAME} — assign Shopify page handle talk-to-a-coach to template page.talk-to-a-coach`,
      storefrontStatus,
      storefrontVerified,
    },
    null,
    2
  )
)

if (!sectionVerified) process.exitCode = 1
