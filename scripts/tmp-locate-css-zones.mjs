import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }
const MAIN = '161112981755'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${MAIN}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

function report(name, content, markers) {
  console.log(`\n########## ${name} (${content.length} bytes) ##########`)
  const styleOpens = [...content.matchAll(/\{%-?\s*style\s*-?%\}/g)].map((m) => m.index)
  const styleCloses = [...content.matchAll(/\{%-?\s*endstyle\s*-?%\}/g)].map((m) => m.index)
  const docOpens = [...content.matchAll(/\{%-?\s*doc\s*-?%\}/g)].map((m) => m.index)
  const docCloses = [...content.matchAll(/\{%-?\s*enddoc\s*-?%\}/g)].map((m) => m.index)
  const cOpens = [...content.matchAll(/\{%-?\s*comment\s*-?%\}/g)].map((m) => m.index)
  const cCloses = [...content.matchAll(/\{%-?\s*endcomment\s*-?%\}/g)].map((m) => m.index)
  console.log('style at', styleOpens, 'endstyle at', styleCloses)
  console.log('doc at', docOpens, 'enddoc at', docCloses)
  console.log('comment at', cOpens, 'endcomment at', cCloses)

  for (const m of markers) {
    const at = content.indexOf(m)
    let zone = 'OUTSIDE any style block'
    if (at > -1) {
      for (let i = 0; i < styleOpens.length; i += 1) {
        const close = styleCloses.find((c) => c > styleOpens[i])
        if (at > styleOpens[i] && close != null && at < close) {
          zone = `inside style block #${i + 1}`
          break
        }
      }
      // inside a comment?
      for (let i = 0; i < cOpens.length; i += 1) {
        const close = cCloses.find((c) => c > cOpens[i])
        if (at > cOpens[i] && close != null && at < close) zone += ' + INSIDE LIQUID COMMENT'
      }
      for (let i = 0; i < docOpens.length; i += 1) {
        const close = docCloses.find((c) => c > docOpens[i])
        if (at > docOpens[i] && close != null && at < close) zone += ' + INSIDE {% doc %}'
      }
    }
    console.log(`  ${m.padEnd(34)} at=${String(at).padEnd(7)} ${at > -1 ? zone : 'NOT FOUND'}`)
  }
}

const layout = await getAsset('layout/theme.liquid')
report('layout/theme.liquid', layout, [
  'lurvox-talk-cta-highlight',
  'lurvox-mobile-talk-cta-v1',
  'lurvox-talk-cta__label',
])
const t = layout.indexOf('lurvox-talk-cta-highlight')
console.log('\n--- layout around talk marker (1400 chars) ---')
console.log(layout.slice(Math.max(0, t - 500), t + 900))

const block = await getAsset('blocks/ai_gen_block_361650c.liquid')
report('blocks/ai_gen_block_361650c.liquid', block, [
  'lurvox-equal-plan-shine',
  'lurvox-hide-plan-radios-v1',
  'lurvox-mobile-plan-cards-v1',
])
