const html = await fetch(`https://www.lurvox.in/?cb=${Date.now()}`, {
  cache: 'no-store',
  headers: { 'User-Agent': 'Mozilla/5.0 verify' },
}).then((r) => r.text())

const checks = {
  'dead anchor gone': !html.includes('/#shopify-section-blocks_C9E4qf'),
  '12-month cta present': html.includes('https://app.lurvox.in/plans/12-months'),
  'new cta label': html.includes('GET THE 12-MONTH PLAN'),
  'hero cta not dead': !/class="ai-transformation-plan-cta-[^"]*"/.test(html)
    ? 'cta class missing'
    : !/<a href="#" class="ai-transformation-plan-cta-/.test(html),
  'countdown persistence': html.includes('lurvox-urgency-countdown-end-v1'),
  'talk cta highlight css': html.includes('lurvox-talk-cta-highlight'),
  'talk cta label js': html.includes('Talk to a coach'),
  'fab label': html.includes('Talk To A Coach'),
  'fab pulse': html.includes('lurvox-talk-pulse'),
  'league redirect intact': html.includes('/pages/league'),
}
for (const [k, v] of Object.entries(checks)) console.log(v === true ? 'OK  ' : 'FAIL', k, v === true ? '' : v)

const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]{0,140}?)<\/a>/gi)]
  .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) }))
  .filter((a) => /plans|league|talk|#/.test(a.href))
console.log('\nrelevant anchors:')
for (const a of anchors) console.log(`${a.href}  |  ${a.text}`)
