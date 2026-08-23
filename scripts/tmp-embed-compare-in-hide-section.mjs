import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  return (
    await (
      await fetch(
        `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
        { headers }
      )
    ).json()
  ).asset?.value
}
async function put(key, value) {
  const res = await fetch(`${REST}/themes/${main.id}/assets.json`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  })
  return res.status
}

const compareSrc = fs.readFileSync(
  path.join(process.cwd(), 'scripts/shopify-assets/sections-lurvox-plan-compare.liquid'),
  'utf8'
)
// Extract the HTML+CSS between section open and schema (reuse styles + table markup with hardcoded rows)
const styleMatch = compareSrc.match(/<style>[\s\S]*?<\/style>/)?.[0] || ''

const rows = [
  ['Personal workout plan', true, true, true],
  ['Personal diet plan', true, true, true],
  ['Daily habit & health trackers', true, true, true],
  ['Coach chat support', true, true, true],
  ['Weekly coach check-ins', true, true, true],
  ['Progress photos & journey', true, true, true],
  ['Weekly plan updates', false, true, true],
  ['Consistency League entry', false, true, true],
  ['Certificates & physical trophies', false, true, true],
  ['Deep plateau-fix coaching', false, true, true],
  ['Lowest monthly rate', false, false, true],
  ['Crazy League + ₹5,000 prize money', false, false, true],
]

const tbody = rows
  .map(
    ([f, a, b, c]) =>
      `<tr><th scope="row" class="lx-plan-compare__feature">${f}</th>` +
      `<td class="lx-plan-compare__cell"><span class="lx-plan-compare__mark ${a ? 'is-yes' : 'is-no'}">${a ? '✓' : '×'}</span></td>` +
      `<td class="lx-plan-compare__cell"><span class="lx-plan-compare__mark ${b ? 'is-yes' : 'is-no'}">${b ? '✓' : '×'}</span></td>` +
      `<td class="lx-plan-compare__cell"><span class="lx-plan-compare__mark ${c ? 'is-yes' : 'is-no'}">${c ? '✓' : '×'}</span></td></tr>`
  )
  .join('\n')

const COMPARE_HTML = `
<!-- lurvox-plan-compare-embedded-v1 -->
<section class="lx-plan-compare" id="compare-plans">
  <div class="lx-plan-compare__inner">
    <p class="lx-plan-compare__eyebrow">Compare plans</p>
    <h2 class="lx-plan-compare__headline">Choose the right plan for your needs</h2>
    <p class="lx-plan-compare__sub">Longer plans unlock more support, league rewards, and prize money.</p>
    <div class="lx-plan-compare__scroll">
      <table class="lx-plan-compare__table">
        <thead>
          <tr>
            <th scope="col" class="lx-plan-compare__feature-head">Product details</th>
            <th scope="col" class="lx-plan-compare__plan-head"><span class="lx-plan-compare__plan-label">3 MONTHS</span><span class="lx-plan-compare__plan-price">₹999</span></th>
            <th scope="col" class="lx-plan-compare__plan-head"><span class="lx-plan-compare__plan-label">6 MONTHS</span><span class="lx-plan-compare__plan-price">₹1,699</span></th>
            <th scope="col" class="lx-plan-compare__plan-head"><span class="lx-plan-compare__plan-label">12 MONTHS</span><span class="lx-plan-compare__plan-price">₹2,999</span></th>
          </tr>
        </thead>
        <tbody>
${tbody}
        </tbody>
        <tfoot>
          <tr>
            <td class="lx-plan-compare__feature"></td>
            <td class="lx-plan-compare__cell"><a class="lx-plan-compare__view" href="https://app.lurvox.in/plans/3-months">View</a></td>
            <td class="lx-plan-compare__cell"><a class="lx-plan-compare__view" href="https://app.lurvox.in/plans/6-months">View</a></td>
            <td class="lx-plan-compare__cell"><a class="lx-plan-compare__view" href="https://app.lurvox.in/plans/12-months">View</a></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</section>
${styleMatch}
`

let hide = await get('sections/lurvox-hide-1month.liquid')
if (!hide) throw new Error('hide section missing')

// Remove prior embeds
hide = hide.replace(/<!-- lurvox-plan-compare-embedded-v1 -->[\s\S]*?(?=\{%\s*schema\s*%\}|$)/, '')

if (!hide.includes('{% schema %}')) {
  hide = hide.trimEnd() + '\n' + COMPARE_HTML + '\n'
} else {
  hide = hide.replace('{% schema %}', `${COMPARE_HTML}\n{% schema %}`)
}

console.log('put hide', await put('sections/lurvox-hide-1month.liquid', hide))
const after = await get('sections/lurvox-hide-1month.liquid')
console.log('readback has embed', after.includes('lurvox-plan-compare-embedded-v1'))

for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const sec = await fetch(
    `https://www.lurvox.in/?sections=lurvox-hide-1month&cb=${Date.now()}-${i}`
  ).then((r) => r.json())
  const html = sec['lurvox-hide-1month'] || ''
  const view = await fetch(`https://www.lurvox.in/?view=&cb=${Date.now()}-${i}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  console.log(i, {
    secHasTable: html.includes('lurvox-plan-compare-embedded-v1'),
    secHasPrize: html.includes('₹5,000') || html.includes('5,000 prize'),
    viewHasTable: view.includes('lurvox-plan-compare-embedded-v1'),
  })
  if (html.includes('lurvox-plan-compare-embedded-v1') && view.includes('lurvox-plan-compare-embedded-v1')) {
    console.log('EMBEDDED COMPARE LIVE')
    break
  }
}
