/**
 * Fix mobile floating bar docking over plan cards.
 * Root cause: findTargets preferred display:none CTA wrappers, so IntersectionObserver
 * never fired and the bar stayed stuck over the plan section.
 *
 * Updates live (main) theme sections/mobile-floating-bar.liquid
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const REST = `https://${STORE}/admin/api/2025-01`
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || '/tmp', 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
}

const KEY = 'sections/mobile-floating-bar.liquid'
const localPath = path.join(
  process.cwd(),
  'scripts',
  'mobile-floating-bar.liquid'
)

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  if (!res.ok) throw new Error(`themes.json ${res.status}`)
  return (await res.json()).themes
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT ${key} -> ${res.status} ${text.slice(0, 400)}`)
  return JSON.parse(text)
}

async function main() {
  const themes = await listThemes()
  const live = themes.find((t) => t.role === 'main')
  if (!live) throw new Error('No main theme')

  const value = fs.readFileSync(localPath, 'utf8')
  if (!value.includes('isRenderable')) {
    throw new Error('Local liquid missing isRenderable fix')
  }
  if (!value.includes('Hidden ones (display:none after direct-nav)')) {
    throw new Error('Local liquid missing dock fix comment')
  }

  await putAsset(live.id, KEY, value)
  console.log(
    JSON.stringify(
      {
        themeId: live.id,
        name: live.name,
        key: KEY,
        bytes: value.length,
        hasFix: value.includes('isRenderable'),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
