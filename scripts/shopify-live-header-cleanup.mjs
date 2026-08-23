import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORE = '9uwyq1-0j.myshopify.com'
const API_VERSION = '2025-01'
const GQL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`
const REST = `https://${STORE}/admin/api/${API_VERSION}`
const LOGIN_LABEL = 'EXISTING CLIENT OR PAYMENT DONE? LOG IN'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}
const clientLogin = fs.readFileSync(
  path.join(__dirname, 'lurvox-client-login.liquid'),
  'utf8'
)
const redesignedHeader = fs.readFileSync(
  path.join(__dirname, 'shopify-assets', 'sections-lurvox-header-redesign.liquid'),
  'utf8'
)

async function gql(query) {
  const response = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2))
  }
  return json.data
}

function numericThemeId(gid) {
  const match = String(gid).match(/OnlineStoreTheme\/(\d+)/)
  if (!match) throw new Error(`Invalid theme ID: ${gid}`)
  return match[1]
}

async function getAsset(themeId, key) {
  const response = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!response.ok) throw new Error(`GET ${key}: ${response.status}`)
  return (await response.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const response = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await response.json()
  if (!response.ok || json.errors) {
    throw new Error(`PUT ${key}: ${JSON.stringify(json.errors || json).slice(0, 500)}`)
  }
}

function patchHeaderGroup(group) {
  let changes = 0
  for (const section of Object.values(group.sections ?? {})) {
    if (!section?.settings) continue
    if (section.type === 'lurvox-client-login') {
      section.settings.enabled = true
      section.settings.prompt = ''
      section.settings.label = LOGIN_LABEL
      changes += 1
    }
    if (section.type === 'lurvox-header-redesign') {
      section.settings.login_prompt = ''
      section.settings.login_label = LOGIN_LABEL
      section.settings.coach_label = ''
      changes += 1
    }
  }
  return changes
}

const themes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const adminMain = themes.find((theme) => theme.role === 'MAIN')
if (!adminMain) throw new Error('No MAIN Shopify theme found')
const requestedId = process.argv[2]
const target = requestedId
  ? themes.find((theme) => numericThemeId(theme.id) === requestedId)
  : adminMain
if (!target) throw new Error(`Theme not found: ${requestedId}`)

const themeId = numericThemeId(target.id)
const groupKey = 'sections/header-group.json'
const group = JSON.parse(await getAsset(themeId, groupKey))
const groupChanges = patchHeaderGroup(group)
if (!groupChanges) throw new Error('No LURVOX login/header section found in header group')

await putAsset(themeId, 'sections/lurvox-client-login.liquid', clientLogin)
await putAsset(themeId, 'sections/lurvox-header-redesign.liquid', redesignedHeader)
await putAsset(themeId, groupKey, JSON.stringify(group, null, 2))

const verifiedGroup = await getAsset(themeId, groupKey)
const verifiedLogin = await getAsset(themeId, 'sections/lurvox-client-login.liquid')
const afterThemes = (await gql(`{ themes(first: 50) { nodes { id name role } } }`)).themes.nodes
const afterMain = afterThemes.find((theme) => theme.role === 'MAIN')
if (afterMain?.id !== adminMain.id) throw new Error('MAIN theme changed during deployment')

console.log(
  JSON.stringify(
    {
      ok: true,
      theme: target,
      groupChanges,
      loginLabelInstalled: verifiedGroup.includes(LOGIN_LABEL),
      coachSignInHidden: verifiedLogin.includes("app.lurvox.in/coach/login"),
      logoChanged: false,
      previewUrl: `https://www.lurvox.in/?preview_theme_id=${themeId}&header_clean=1`,
    },
    null,
    2
  )
)
