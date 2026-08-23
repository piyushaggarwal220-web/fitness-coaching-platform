/**
 * Pin FAB with CSS bottom (never hide mid-scroll),
 * quiet login strip + balanced mobile logo header.
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

async function listThemes() {
  const res = await fetch(`${REST}/themes.json`, { headers })
  if (!res.ok) throw new Error(`themes ${res.status}`)
  return (await res.json()).themes
}

async function getAsset(themeId, key) {
  const res = await fetch(
    `${REST}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) throw new Error(`GET ${key} ${res.status}`)
  return (await res.json()).asset?.value ?? ''
}

async function putAsset(themeId, key, value) {
  const res = await fetch(`${REST}/themes/${themeId}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  if (!res.ok) throw new Error(`PUT ${key} ${res.status} ${(await res.text()).slice(0, 400)}`)
}

function patchLayoutHeader(layout) {
  let next = layout.replace(/\r\n/g, '\n')
  const marker = 'lurvox-mobile-header-logo-v1'
  const start = `/* ${marker} */`
  const end = `/* /${marker} */`
  const block = `/* lurvox-mobile-header-logo-v3 */
    /* Do not alter .header__columns grid — Horizon uses multi-track template. */
    @media screen and (max-width: 749px) {
      #header-component .header-logo__image,
      #header-component .header-logo img {
        max-height: 36px !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
      }

      a.header-actions__action[href*="talk-to-a-coach"] .lurvox-talk-cta__label {
        display: none !important;
      }
    }
/* /lurvox-mobile-header-logo-v3 */`

  if (next.includes(start) && next.includes(end)) {
    const re = new RegExp(
      start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '[\\s\\S]*?' +
        end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    return next.replace(re, block)
  }

  if (next.includes('lurvox-mobile-header-logo-v2')) {
    const re = /\/\* lurvox-mobile-header-logo-v2 \*\/[\s\S]*?\/\* \/lurvox-mobile-header-logo-v2 \*\//
    return next.replace(re, block)
  }

  if (next.includes('lurvox-mobile-header-logo-v3')) {
    const re = /\/\* lurvox-mobile-header-logo-v3 \*\/[\s\S]*?\/\* \/lurvox-mobile-header-logo-v3 \*\//
    return next.replace(re, block)
  }

  if (next.includes('lurvox-mobile-talk-cta-v1')) {
    return next.replace('/* /lurvox-mobile-talk-cta-v1 */', `/* /lurvox-mobile-talk-cta-v1 */\n\n${block}`)
  }

  if (next.includes('</head>')) {
    return next.replace('</head>', `<style>\n${block}\n</style>\n</head>`)
  }

  throw new Error('Could not inject header logo styles')
}

async function main() {
  const themes = await listThemes()
  const live = themes.find((t) => t.role === 'main')
  if (!live) throw new Error('No main theme')

  const fab = fs.readFileSync(path.join('scripts', 'mobile-floating-bar.liquid'), 'utf8')
  const login = fs.readFileSync(path.join('scripts', 'lurvox-client-login.liquid'), 'utf8')
  let layout = await getAsset(live.id, 'layout/theme.liquid')
  layout = patchLayoutHeader(layout)

  if (!fab.includes('lurvox-fab-pin-bottom-v2')) {
    throw new Error('FAB missing pin-bottom-v2')
  }
  if (!login.includes('lurvox-login-header-clean-v2')) {
    throw new Error('Login missing clean-v2')
  }
  if (!layout.includes('lurvox-mobile-header-logo-v3')) {
    throw new Error('Layout missing header-logo-v3')
  }

  await putAsset(live.id, 'sections/mobile-floating-bar.liquid', fab)
  await putAsset(live.id, 'sections/lurvox-client-login.liquid', login)
  await putAsset(live.id, 'layout/theme.liquid', layout)

  fs.writeFileSync(path.join('scripts', 'tmp-live-layout-theme.liquid'), layout)

  console.log(
    JSON.stringify(
      {
        themeId: live.id,
        name: live.name,
        fabBytes: fab.length,
        loginBytes: login.length,
        layoutBytes: layout.length,
        preview: `https://www.lurvox.in/?fabfix=${Date.now()}`,
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
