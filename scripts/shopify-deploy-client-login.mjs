import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const APP_LOGIN_URL = 'https://app.lurvox.in/login'
const SECTION_FILENAME = 'sections/lurvox-client-login.liquid'
const HEADER_FILENAME = 'sections/header-group.json'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  throw new Error('Shopify auth token not found. Run: node scripts/shopify-pkce-auth.mjs')
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/lurvox-client-login.liquid'),
  'utf8'
)

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

function parseThemeJson(content) {
  const jsonStart = content.indexOf('{')
  if (jsonStart < 0) throw new Error(`${HEADER_FILENAME} does not contain JSON`)
  return JSON.parse(content.slice(jsonStart))
}

const storeData = await gql(`{
  shop { primaryDomain { url } }
  themes(first: 20) { nodes { id name role } }
}`)
const mainTheme = storeData.themes.nodes.find((theme) => theme.role === 'MAIN')
if (!mainTheme) throw new Error('No live MAIN theme found')

const current = await gql(
  `query themeHeader($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: mainTheme.id, filenames: [HEADER_FILENAME] }
)
const headerNode = current.theme.files.nodes.find((node) => node.filename === HEADER_FILENAME)
if (!headerNode?.body?.content) throw new Error(`Could not read ${HEADER_FILENAME}`)

const header = parseThemeJson(headerNode.body.content)
header.sections ||= {}
header.order ||= []
header.sections.lurvox_client_login = {
  type: 'lurvox-client-login',
  settings: {
    enabled: true,
    homepage_only: true,
    prompt: 'Already training with LURVOX?',
    label: 'Existing client? Log in',
    login_url: APP_LOGIN_URL,
    accent_color: '#FF6200',
  },
}

header.order = header.order.filter((id) => id !== 'lurvox_client_login')
const announcementIndex = header.order.findIndex((id) => {
  return header.sections[id]?.type === 'header-announcements'
})
header.order.splice(announcementIndex + 1, 0, 'lurvox_client_login')
const headerContent = `${JSON.stringify(header, null, 2)}\n`

const upload = await gql(
  `mutation deployClientLogin($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: mainTheme.id,
    files: [
      {
        filename: SECTION_FILENAME,
        body: { type: 'TEXT', value: sectionLiquid },
      },
      {
        filename: HEADER_FILENAME,
        body: { type: 'TEXT', value: headerContent },
      },
    ],
  }
)

if (upload.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upload.themeFilesUpsert.userErrors, null, 2))
}

const verification = await gql(
  `query verifyClientLogin($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: mainTheme.id, filenames: [SECTION_FILENAME, HEADER_FILENAME] }
)
const verifiedFiles = Object.fromEntries(
  verification.theme.files.nodes.map((node) => [node.filename, node.body?.content || ''])
)
const verifiedHeader = parseThemeJson(verifiedFiles[HEADER_FILENAME] || '')
const verifiedSettings = verifiedHeader.sections?.lurvox_client_login?.settings
const fileVerified =
  verifiedFiles[SECTION_FILENAME]?.includes('Existing client? Log in') &&
  verifiedSettings?.login_url === APP_LOGIN_URL &&
  verifiedSettings?.enabled === true

const destinationUrl = storeData.shop.primaryDomain.url
let storefrontVerified = false
let storefrontStatus = null
let deploymentMethod = 'GraphQL'
let sectionEndpointVerified = false
try {
  const response = await fetch(destinationUrl, {
    headers: { 'User-Agent': 'LURVOX theme deployment verifier' },
  })
  storefrontStatus = response.status
  const html = await response.text()
  storefrontVerified =
    response.ok &&
    html.includes('Existing client? Log in') &&
    html.includes(APP_LOGIN_URL)
} catch {}

if (!storefrontVerified) {
  await restUpsert(mainTheme.id, SECTION_FILENAME, sectionLiquid)
  await restUpsert(mainTheme.id, HEADER_FILENAME, headerContent)
  deploymentMethod = 'GraphQL + REST cache refresh'
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const response = await fetch(`${destinationUrl}/?verify_client_login=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'LURVOX theme deployment verifier',
    },
  })
  storefrontStatus = response.status
  const html = await response.text()
  storefrontVerified =
    response.ok &&
    html.includes('Existing client? Log in') &&
    html.includes(APP_LOGIN_URL) &&
    html.includes('lurvox-client-login__inner')

  if (!storefrontVerified) {
    const sectionId = html.match(
      /id="shopify-section-([^"]*lurvox_client_login)"/
    )?.[1]
    if (sectionId) {
      const sectionResponse = await fetch(
        `${destinationUrl}/?section_id=${encodeURIComponent(sectionId)}&verify=${Date.now()}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'User-Agent': 'LURVOX theme deployment verifier',
          },
        }
      )
      const sectionHtml = await sectionResponse.text()
      sectionEndpointVerified =
        sectionResponse.ok &&
        sectionHtml.includes('Existing client? Log in') &&
        sectionHtml.includes(APP_LOGIN_URL) &&
        sectionHtml.includes('lurvox-client-login__inner')
    }
  }
}

console.log(
  JSON.stringify(
    {
      theme: { id: mainTheme.id, name: mainTheme.name, role: mainTheme.role },
      destinationUrl,
      loginUrl: APP_LOGIN_URL,
      deploymentMethod,
      uploadedFiles: upload.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename),
      fileVerified,
      storefrontStatus,
      storefrontVerified,
      sectionEndpointVerified,
      fullPageCachePending: sectionEndpointVerified && !storefrontVerified,
    },
    null,
    2
  )
)

if (!fileVerified) process.exitCode = 1
