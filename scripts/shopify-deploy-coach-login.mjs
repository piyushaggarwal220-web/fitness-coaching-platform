import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const COACH_LOGIN_URL = 'https://app.lurvox.in/coach/login'
const SECTION_FILENAME = 'sections/lurvox-coach-login.liquid'
const FOOTER_FILENAME = 'sections/footer-group.json'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')

if (!fs.existsSync(tokenPath)) {
  throw new Error('Shopify auth token not found. Run: node scripts/shopify-pkce-auth.mjs')
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/lurvox-coach-login.liquid'),
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
  if (jsonStart < 0) throw new Error(`${FOOTER_FILENAME} does not contain JSON`)
  return JSON.parse(content.slice(jsonStart))
}

const storeData = await gql(`{
  shop { primaryDomain { url } }
  themes(first: 20) { nodes { id name role } }
}`)
const mainTheme = storeData.themes.nodes.find((theme) => theme.role === 'MAIN')
if (!mainTheme) throw new Error('No live MAIN theme found')

const current = await gql(
  `query themeFooter($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: mainTheme.id, filenames: [FOOTER_FILENAME] }
)
const footerNode = current.theme.files.nodes.find((node) => node.filename === FOOTER_FILENAME)
if (!footerNode?.body?.content) throw new Error(`Could not read ${FOOTER_FILENAME}`)

const footer = parseThemeJson(footerNode.body.content)
footer.sections ||= {}
footer.order ||= []
footer.sections.lurvox_coach_login = {
  type: 'lurvox-coach-login',
  settings: {
    enabled: true,
    homepage_only: false,
    label: 'Coach sign in',
    login_url: COACH_LOGIN_URL,
  },
}

// Keep near the end of the page (after main footer content).
footer.order = footer.order.filter((id) => id !== 'lurvox_coach_login')
footer.order.push('lurvox_coach_login')
const footerContent = `${JSON.stringify(footer, null, 2)}\n`

const upload = await gql(
  `mutation deployCoachLogin($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
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
        filename: FOOTER_FILENAME,
        body: { type: 'TEXT', value: footerContent },
      },
    ],
  }
)

if (upload.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upload.themeFilesUpsert.userErrors, null, 2))
}

const verification = await gql(
  `query verifyCoachLogin($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames, first: 5) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: mainTheme.id, filenames: [SECTION_FILENAME, FOOTER_FILENAME] }
)
const verifiedFiles = Object.fromEntries(
  verification.theme.files.nodes.map((node) => [node.filename, node.body?.content || ''])
)
const verifiedFooter = parseThemeJson(verifiedFiles[FOOTER_FILENAME] || '')
const verifiedSettings = verifiedFooter.sections?.lurvox_coach_login?.settings
const order = verifiedFooter.order || []
const fileVerified =
  verifiedFiles[SECTION_FILENAME]?.includes('Coach sign in') &&
  verifiedSettings?.login_url === COACH_LOGIN_URL &&
  verifiedSettings?.enabled === true &&
  order[order.length - 1] === 'lurvox_coach_login'

const destinationUrl = storeData.shop.primaryDomain.url
let storefrontVerified = false
let storefrontStatus = null
let deploymentMethod = 'GraphQL'
let sectionEndpointVerified = false

try {
  const response = await fetch(`${destinationUrl}/?verify_coach_login=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'LURVOX theme deployment verifier',
    },
  })
  storefrontStatus = response.status
  const html = await response.text()
  storefrontVerified =
    response.ok &&
    html.includes('Coach sign in') &&
    html.includes(COACH_LOGIN_URL) &&
    html.includes('lurvox-coach-login')
} catch {}

if (!storefrontVerified) {
  await restUpsert(mainTheme.id, SECTION_FILENAME, sectionLiquid)
  await restUpsert(mainTheme.id, FOOTER_FILENAME, footerContent)
  deploymentMethod = 'GraphQL + REST cache refresh'
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const response = await fetch(`${destinationUrl}/?verify_coach_login=${Date.now()}`, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'LURVOX theme deployment verifier',
    },
  })
  storefrontStatus = response.status
  const html = await response.text()
  storefrontVerified =
    response.ok &&
    html.includes('Coach sign in') &&
    html.includes(COACH_LOGIN_URL) &&
    html.includes('lurvox-coach-login')

  if (!storefrontVerified) {
    const sectionId = html.match(/id="shopify-section-([^"]*lurvox_coach_login)"/)?.[1]
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
        sectionHtml.includes('Coach sign in') &&
        sectionHtml.includes(COACH_LOGIN_URL) &&
        sectionHtml.includes('lurvox-coach-login')
    }
  }
}

console.log(
  JSON.stringify(
    {
      theme: { id: mainTheme.id, name: mainTheme.name, role: mainTheme.role },
      destinationUrl,
      loginUrl: COACH_LOGIN_URL,
      deploymentMethod,
      uploadedFiles: upload.themeFilesUpsert.upsertedThemeFiles.map((file) => file.filename),
      fileVerified,
      storefrontStatus,
      storefrontVerified,
      sectionEndpointVerified,
      fullPageCachePending: sectionEndpointVerified && !storefrontVerified,
      footerOrderTail: (verifiedFooter.order || []).slice(-3),
    },
    null,
    2
  )
)

if (!fileVerified) process.exitCode = 1
