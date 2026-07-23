import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const STORE = '9uwyq1-0j.myshopify.com'
export const API_VERSION = '2025-01'
export const API = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
export const COACH_LOGIN_URL = 'https://app.lurvox.in/coach/login'
export const SECTION_FILENAME = 'sections/lurvox-coach-login.liquid'
export const FOOTER_FILENAME = 'sections/footer-group.json'

const scriptFilePath = fileURLToPath(import.meta.url)
export const SCRIPTS_DIR = path.dirname(scriptFilePath)

export function resolveTempDir() {
  return (
    process.env.TEMP?.trim() ||
    process.env.TMPDIR?.trim() ||
    process.env.TMP?.trim() ||
    os.tmpdir()
  )
}

export function getAuthTokenPath() {
  return path.join(resolveTempDir(), 'shopify-auth-token.json')
}

export function getAuthUrlPath() {
  return path.join(resolveTempDir(), 'shopify-auth-url.txt')
}

export function loadAuthToken() {
  const tokenPath = getAuthTokenPath()
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Shopify auth token not found. Run: node scripts/shopify-pkce-auth.mjs')
  }
  return JSON.parse(fs.readFileSync(tokenPath, 'utf8'))
}

export async function gql(token, query, variables = {}) {
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

export async function getShopAndMainTheme(token) {
  const storeData = await gql(
    token,
    `{
      shop { primaryDomain { url } }
      themes(first: 20) { nodes { id name role } }
    }`
  )

  const mainTheme = storeData.themes.nodes.find((theme) => theme.role === 'MAIN')
  if (!mainTheme) throw new Error('No live MAIN theme found')

  return {
    destinationUrl: storeData.shop.primaryDomain.url,
    mainTheme,
  }
}

export async function getThemeFiles(token, themeId, filenames) {
  const data = await gql(
    token,
    `query themeFiles($id: ID!, $filenames: [String!]!) {
      theme(id: $id) {
        files(filenames: $filenames, first: 20) {
          nodes {
            filename
            body { ... on OnlineStoreThemeFileBodyText { content } }
          }
        }
      }
    }`,
    { id: themeId, filenames }
  )

  const files = Object.fromEntries(filenames.map((filename) => [filename, null]))
  for (const node of data.theme.files.nodes) {
    files[node.filename] = node.body?.content ?? null
  }
  return files
}

export function parseThemeJson(content) {
  const jsonStart = content.indexOf('{')
  if (jsonStart < 0) throw new Error(`${FOOTER_FILENAME} does not contain JSON`)
  return JSON.parse(content.slice(jsonStart))
}

export function getCoachSectionSourcePath() {
  return path.join(SCRIPTS_DIR, 'lurvox-coach-login.liquid')
}

export function readCoachSectionSource() {
  return fs.readFileSync(getCoachSectionSourcePath(), 'utf8')
}

function createTimestampLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function createBackupDirectory(label) {
  const dir = path.join(SCRIPTS_DIR, 'shopify-backups', `${createTimestampLabel()}-${label}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function writeBackupFiles(directory, files) {
  for (const [filename, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue
    const outputPath = path.join(directory, filename)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, content, 'utf8')
  }
}

export function writeBackupMetadata(directory, metadata) {
  fs.writeFileSync(path.join(directory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}
