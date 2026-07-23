import path from 'node:path'

import {
  COACH_LOGIN_URL,
  FOOTER_FILENAME,
  SECTION_FILENAME,
  STORE,
  createBackupDirectory,
  getShopAndMainTheme,
  getThemeFiles,
  gql,
  loadAuthToken,
  parseThemeJson,
  readCoachSectionSource,
  writeBackupFiles,
  writeBackupMetadata,
} from './shopify-common.mjs'

const token = loadAuthToken()
const sectionLiquid = readCoachSectionSource()

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

const { destinationUrl, mainTheme } = await getShopAndMainTheme(token)
const currentFiles = await getThemeFiles(token, mainTheme.id, [SECTION_FILENAME, FOOTER_FILENAME])
if (!currentFiles[FOOTER_FILENAME]) throw new Error(`Could not read ${FOOTER_FILENAME}`)

const backupDirectory = createBackupDirectory('coach-login-predeploy')
writeBackupFiles(backupDirectory, currentFiles)
writeBackupMetadata(backupDirectory, {
  createdAt: new Date().toISOString(),
  destinationUrl,
  theme: mainTheme,
  files: Object.entries(currentFiles).map(([filename, content]) => ({
    filename,
    present: typeof content === 'string',
    bytes: typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0,
  })),
})

const footer = parseThemeJson(currentFiles[FOOTER_FILENAME])
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
  token,
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
  token,
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
      backupDirectory,
      backupDirectoryRelativeToRepo: path.relative(process.cwd(), backupDirectory),
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
