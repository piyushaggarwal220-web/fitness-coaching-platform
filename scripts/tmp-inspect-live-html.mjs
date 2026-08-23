import fs from 'node:fs'

const UA = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

const res = await fetch(`https://www.lurvox.in/?zz=${Math.random().toString(36).slice(2)}`, {
  headers: UA,
  redirect: 'follow',
})
const html = await res.text()
fs.writeFileSync('C:/Users/DELL/coaching-platform/scripts/tmp-live-now.html', html)

const probes = {
  talkSelector: 'header-actions__action[href*="talk-to-a-coach"]',
  talkLabelClass: 'lurvox-talk-cta__label',
  talkMobileMarker: 'lurvox-mobile-talk-cta-v1',
  talkPulse: 'lurvox-talk-cta-pulse',
  clientLoginPrompt: 'lurvox-client-login__prompt',
  clientLoginClass: 'lurvox-client-login',
  planCardInner: 'ai-transformation-plan-card-inner',
  planMobileMarker: 'lurvox-mobile-plan-cards-v1',
  equalShine: 'lurvox-equal-plan-shine',
  hideRadios: 'lurvox-hide-plan-radios-v1',
  clientResultsNav: 'ai-client-results-nav-',
  clientResultsMarker: 'lurvox-mobile-client-results-v1',
}

console.log('bytes', html.length, 'status', res.status)
console.log('serverTiming theme:', (res.headers.get('server-timing') || '').match(/theme;desc="(\d+)"/)?.[1])
for (const [k, v] of Object.entries(probes)) {
  console.log(String(k).padEnd(22), html.includes(v))
}

// Which stylesheet bundles are linked?
const cssLinks = [...html.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => m[1])
console.log('\nCSS links:')
for (const l of [...new Set(cssLinks)]) console.log('  ', l)

// Show context around the talk CTA style block if present
const idx = html.indexOf('talk-to-a-coach')
if (idx > -1) {
  console.log('\ncontext around first talk-to-a-coach occurrence:')
  console.log(html.slice(Math.max(0, idx - 400), idx + 700))
} else {
  console.log('\nNO talk-to-a-coach occurrence in HTML')
}
