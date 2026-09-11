/**
 * Publish unpublished draft Copy of Live quiz-v3 to live MAIN.
 * Only theme 162252554491. Refuses if name/role don't match.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const CLIENT_ID = '7e9cb568cfd431c538f36d1ad3f2b4f6'
const DRAFT_ID = 162252554491
const TARGET_NAME = 'Copy of Live quiz-v3 2026-08-26 18:09'
const tokenPath = path.join(process.env.TEMP, 'shopify-auth-token.json')
const tokenFile = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))

const refresh = await fetch(`https://${STORE}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokenFile.refresh_token,
  }),
})
if (refresh.ok) {
  Object.assign(tokenFile, JSON.parse(await refresh.text()))
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2))
  console.log('token refreshed')
} else {
  console.log('refresh skipped', refresh.status)
}

const token = tokenFile.access_token
const headers = {
  'X-Shopify-Access-Token': token,
  'Content-Type': 'application/json',
}

const themes = (await (await fetch(`https://${STORE}/admin/api/2025-01/themes.json`, { headers })).json())
  .themes
for (const theme of themes) {
  console.log(`${theme.id}  ${theme.role.padEnd(12)}  ${theme.name}`)
}

const draft = themes.find((theme) => theme.id === DRAFT_ID)
const main = themes.find((theme) => theme.role === 'main')
if (!draft) throw new Error('Draft theme not found')
if (draft.name.trim() !== TARGET_NAME) throw new Error(`Unexpected name: ${draft.name}`)
if (draft.role === 'main') {
  console.log('Already live.')
  process.exit(0)
}

console.log(`Publishing ${draft.id} (${draft.role}) in place of main ${main?.id} ${main?.name}`)

const gql = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    query: `mutation themePublish($id: ID!) {
      themePublish(id: $id) {
        theme { id name role }
        userErrors { field message }
      }
    }`,
    variables: { id: `gid://shopify/OnlineStoreTheme/${DRAFT_ID}` },
  }),
})
const json = await gql.json()
const payload = json.data?.themePublish
if (json.errors?.length || payload?.userErrors?.length) {
  throw new Error(JSON.stringify(json, null, 2))
}
const role = String(payload.theme.role || '').toUpperCase()
if (role !== 'MAIN') throw new Error(`Publish did not set MAIN: ${JSON.stringify(payload.theme)}`)

console.log('LIVE:', payload.theme.name, payload.theme.id, payload.theme.role)
