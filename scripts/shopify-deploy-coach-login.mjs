import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const STORE = process.env.SHOPIFY_STORE || '9uwyq1-0j.myshopify.com'
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10'
const API = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
const COACH_LOGIN_URL = 'https://app.lurvox.in/coach/login'
const SECTION_FILENAME = 'sections/lurvox-coach-login.liquid'
const FOOTER_FILENAME = 'sections/footer-group.json'
const rawDeployTarget = (process.env.SHOPIFY_DEPLOY_TARGET || 'copy').trim().toLowerCase()
const DEPLOY_TARGET = rawDeployTarget === 'main' ? 'live' : rawDeployTarget
const tokenPathCandidates = [
  process.env.SHOPIFY_AUTH_TOKEN_PATH,
  process.env.TMPDIR && path.join(process.env.TMPDIR, 'shopify-auth-token.json'),
  process.env.TEMP && path.join(process.env.TEMP, 'shopify-auth-token.json'),
  process.env.TMP && path.join(process.env.TMP, 'shopify-auth-token.json'),
  path.join(os.tmpdir(), 'shopify-auth-token.json'),
].filter(Boolean)
const tokenPath = tokenPathCandidates.find((candidate) => fs.existsSync(candidate))
const sectionPath =
  process.env.SHOPIFY_COACH_LOGIN_SECTION_PATH ||
  path.join(scriptDir, 'lurvox-coach-login.liquid')

if (!['copy', 'live'].includes(DEPLOY_TARGET)) {
  throw new Error('SHOPIFY_DEPLOY_TARGET must be "copy" (default) or "live"')
}

if (!tokenPath) {
  throw new Error(
    `Shopify auth token not found. Run: node scripts/shopify-pkce-auth.mjs or set SHOPIFY_AUTH_TOKEN_PATH. Checked: ${tokenPathCandidates.join(', ')}`
  )
}

if (!fs.existsSync(sectionPath)) {
  throw new Error(`Coach login section not found: ${sectionPath}`)
}

const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
const sectionLiquid = fs.readFileSync(sectionPath, 'utf8')

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
  const response = await fetch(
    `https://${STORE}/admin/api/${API_VERSION}/themes/${numericThemeId(themeId)}/assets.json`,
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

function numericThemeId(themeId) {
  return String(themeId).split('/').pop()
}

function themePreviewUrl(destinationUrl, themeId) {
  const url = new URL(destinationUrl)
  url.searchParams.set('preview_theme_id', numericThemeId(themeId))
  return url.toString()
}

function storefrontUrl(destinationUrl, themeId, params = {}) {
  const url = new URL(destinationUrl)
  if (DEPLOY_TARGET === 'copy') {
    url.searchParams.set('preview_theme_id', numericThemeId(themeId))
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function formatUserErrors(errors) {
  return errors
    .map((error) => {
      const field = Array.isArray(error.field) ? error.field.join('.') : error.field || 'theme'
      return `${field}: ${error.message}`
    })
    .join('; ')
}

async function fetchThemeFiles(themeId, filenames) {
  const current = await gql(
    `query themeFiles($id: ID!, $filenames: [String!]!) {
      theme(id: $id) {
        files(filenames: $filenames, first: 10) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }`,
    { id: themeId, filenames }
  )

  return current.theme?.files?.nodes || []
}

async function waitForThemeFiles(themeId, filenames) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < 60000) {
    try {
      const nodes = await fetchThemeFiles(themeId, filenames)
      if (nodes.length > 0) return nodes
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  throw new Error(
    `Timed out waiting for duplicated theme files to become readable${
      lastError ? `: ${lastError.message}` : ''
    }`
  )
}

async function duplicateTheme(sourceTheme) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const copyName =
    process.env.SHOPIFY_THEME_COPY_NAME?.trim() ||
    `${sourceTheme.name} - coach login edit ${stamp}`
  const duplicate = await gql(
    `mutation duplicateTheme($id: ID!, $name: String) {
      themeDuplicate(id: $id, name: $name) {
        newTheme { id name role }
        userErrors { field message }
      }
    }`,
    { id: sourceTheme.id, name: copyName }
  )

  const errors = duplicate.themeDuplicate?.userErrors || []
  if (errors.length) {
    throw new Error(`Theme duplicate failed: ${formatUserErrors(errors)}`)
  }

  const newTheme = duplicate.themeDuplicate?.newTheme
  if (!newTheme?.id) {
    throw new Error('Theme duplicate failed: Shopify did not return a new theme')
  }

  await waitForThemeFiles(newTheme.id, [FOOTER_FILENAME])
  return newTheme
}

const storeData = await gql(`{
  shop { primaryDomain { url } }
  themes(first: 20) { nodes { id name role } }
}`)
const mainTheme = storeData.themes.nodes.find((theme) => theme.role === 'MAIN')
if (!mainTheme) throw new Error('No live MAIN theme found')

const targetTheme = DEPLOY_TARGET === 'live' ? mainTheme : await duplicateTheme(mainTheme)
const footerFiles = await fetchThemeFiles(targetTheme.id, [FOOTER_FILENAME])
const footerNode = footerFiles.find((node) => node.filename === FOOTER_FILENAME)
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
    themeId: targetTheme.id,
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
  { id: targetTheme.id, filenames: [SECTION_FILENAME, FOOTER_FILENAME] }
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
let deploymentMethod = DEPLOY_TARGET === 'live' ? 'GraphQL live theme' : 'GraphQL duplicated theme'
let sectionEndpointVerified = false
let verificationHtml = ''

try {
  const response = await fetch(
    storefrontUrl(destinationUrl, targetTheme.id, { verify_coach_login: Date.now() }),
    {
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'LURVOX theme deployment verifier',
      },
    }
  )
  storefrontStatus = response.status
  const html = await response.text()
  verificationHtml = html
  storefrontVerified =
    response.ok &&
    html.includes('Coach sign in') &&
    html.includes(COACH_LOGIN_URL) &&
    html.includes('lurvox-coach-login')
} catch {}

if (!storefrontVerified) {
  await restUpsert(targetTheme.id, SECTION_FILENAME, sectionLiquid)
  await restUpsert(targetTheme.id, FOOTER_FILENAME, footerContent)
  deploymentMethod =
    DEPLOY_TARGET === 'live'
      ? 'GraphQL + REST cache refresh live theme'
      : 'GraphQL + REST cache refresh duplicated theme'
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const response = await fetch(
    storefrontUrl(destinationUrl, targetTheme.id, { verify_coach_login: Date.now() }),
    {
      headers: {
        'Cache-Control': 'no-cache',
        'User-Agent': 'LURVOX theme deployment verifier',
      },
    }
  )
  storefrontStatus = response.status
  const html = await response.text()
  verificationHtml = html
  storefrontVerified =
    response.ok &&
    html.includes('Coach sign in') &&
    html.includes(COACH_LOGIN_URL) &&
    html.includes('lurvox-coach-login')

  if (!storefrontVerified) {
    const sectionId = html.match(/id="shopify-section-([^"]*lurvox_coach_login)"/)?.[1]
    if (sectionId) {
      const sectionResponse = await fetch(
        storefrontUrl(destinationUrl, targetTheme.id, {
          section_id: sectionId,
          verify: Date.now(),
        }),
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

if (!storefrontVerified && !sectionEndpointVerified && verificationHtml) {
  const sectionId = verificationHtml.match(/id="shopify-section-([^"]*lurvox_coach_login)"/)?.[1]
  if (sectionId) {
    const sectionResponse = await fetch(
      storefrontUrl(destinationUrl, targetTheme.id, {
        section_id: sectionId,
        verify: Date.now(),
      }),
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

console.log(
  JSON.stringify(
    {
      deployTarget: DEPLOY_TARGET,
      apiVersion: API_VERSION,
      sourceTheme: { id: mainTheme.id, name: mainTheme.name, role: mainTheme.role },
      targetTheme: { id: targetTheme.id, name: targetTheme.name, role: targetTheme.role },
      destinationUrl,
      previewUrl: DEPLOY_TARGET === 'copy' ? themePreviewUrl(destinationUrl, targetTheme.id) : null,
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
