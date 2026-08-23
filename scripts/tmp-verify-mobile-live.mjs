import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
console.log(
  'main/unpub',
  themes
    .filter((t) => t.role === 'main' || t.name?.includes('Mobile Home') || t.name?.includes('Plan Radio'))
    .map((t) => ({ id: t.id, name: t.name, role: t.role }))
)

const urls = [
  `https://www.lurvox.in/?cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?cb=${Date.now()}`,
]
for (const url of urls) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    redirect: 'follow',
  })
  const body = await res.text()
  console.log(
    JSON.stringify({
      url,
      status: res.status,
      bytes: body.length,
      themeId: (() => {
        const m = body.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
        if (!m) return null
        try {
          return JSON.parse(m[1]).id
        } catch {
          return null
        }
      })(),
      hasMobile: /lurvox-mobile-/.test(body),
      hasActiveNav: /\.active\s+\.ai-client-results-nav-/.test(body),
      hasTalkNone: /lurvox-talk-cta__label[\s\S]{0,120}display:\s*none/.test(body),
    })
  )
}
process.exit(0)
/* dead code below kept intentionally unreachable for now */
const res = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
  redirect: 'follow',
})
const body = await res.text()

const themeAssign = body.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
let themeObj = null
if (themeAssign) {
  try {
    themeObj = JSON.parse(themeAssign[1])
  } catch {
    themeObj = { raw: themeAssign[1].slice(0, 250) }
  }
}

const cdnThemeFolder = (body.match(/\/cdn\/shop\/t\/(\d+)\//) || [])[1] || null

const checks = {
  status: res.status,
  bytes: body.length,
  cdnThemeFolder,
  themeObj,
  hasMobileMarkerAny: /lurvox-mobile-/.test(body),
  hasHideRadios: body.includes('lurvox-hide-plan-radios-v1'),
  hasActiveNavRule: /\.active\s+\.ai-client-results-nav-/.test(body),
  hasTalkLabelNone: /lurvox-talk-cta__label[\s\S]{0,120}display:\s*none/.test(body),
  hasPlanStack: /plan-card-inner-[\w]+[\s\S]{0,200}grid-template-columns:\s*1fr\s*!important/.test(
    body
  ),
  hasGallerySlideFull: /fitness-gallery__slide-[\w]+[\s\S]{0,120}width:\s*100%/.test(body),
  hasVisibilityHiddenNav: /ai-client-results-nav-[\w]+[\s\S]{0,200}visibility:\s*hidden/.test(body),
}

console.log(JSON.stringify(checks, null, 2))
