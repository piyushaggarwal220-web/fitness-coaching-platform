/**
 * Fingerprint which theme layout the storefront is actually rendering.
 */
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }

const themes = (await fetch(`${REST}/themes.json`, { headers }).then((r) => r.json())).themes

const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
}).then((r) => r.text())

fs.writeFileSync('C:/Users/DELL/coaching-platform/scripts/tmp-live-home-fingerprint.html', html)

const cdnTheme = (html.match(/cdn\/shop\/t\/(\d+)\//) || [])[1]
const hasTalk = html.includes('lurvox-talk-cta-highlight')
const hasAuto = html.includes('lurvox-photo-carousel-autoplay-v1')
const hasLeagueBack = html.includes('ensureLeagueBack')
const hasConsistencyRedirect = html.includes("page.handle == 'consistency-league'") // won't be in HTML
const hasLeagueScript = html.includes('lx-league__back')
const bodyTail = html.slice(html.lastIndexOf('</main>'), html.lastIndexOf('</body>') + 8)

console.log({
  cdnTheme,
  hasTalk,
  hasAuto,
  hasLeagueBack: html.includes('ensureLeagueBack'),
  hasLeagueStyle: html.includes('lx-league__back'),
  htmlBytes: html.length,
  bodyTailPreview: bodyTail.slice(0, 500),
})

for (const theme of themes) {
  const res = await fetch(
    `${REST}/themes/${theme.id}/assets.json?asset[key]=layout/theme.liquid`,
    { headers }
  )
  const json = await res.json()
  const val = json.asset?.value
  if (!val) {
    console.log(theme.id, theme.role, theme.name, 'NO_LAYOUT')
    continue
  }
  const fingerprints = {
    talk: val.includes('lurvox-talk-cta-highlight'),
    auto: val.includes('lurvox-photo-carousel-autoplay-v1'),
    league: val.includes('ensureLeagueBack'),
    bytes: val.length,
    updated: json.asset.updated_at,
  }
  // Compare a unique mid-layout string length / hash-ish
  const mid = val.includes('setHeaderHeighCustomProperties')
  const viewTransition = val.includes('view-transition-render-blocker')
  console.log(
    [
      String(theme.id).padEnd(14),
      theme.role.padEnd(12),
      (theme.name || '').slice(0, 36).padEnd(37),
      JSON.stringify(fingerprints),
      'mid=' + mid,
      'vt=' + viewTransition,
    ].join(' ')
  )
}
