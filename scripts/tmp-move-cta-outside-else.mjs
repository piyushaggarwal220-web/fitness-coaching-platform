import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME_ID = '161086767355'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME_ID}/assets.json?asset[key]=${encodeURIComponent(key)}`,
    { headers: { 'X-Shopify-Access-Token': token.access_token } }
  )
  return (await res.json()).asset
}

async function putAsset(key, value) {
  const res = await fetch(`${REST}/themes/${THEME_ID}/assets.json`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ asset: { key, value } }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.asset?.updated_at
}

let wyg = (await getAsset('blocks/ai_gen_block_68d702b.liquid')).value

const ctaBlock = `    {% if block.settings.cta_label != blank and block.settings.cta_url != blank %}
      <div class="ai-what-you-get-cta-wrap-{{ ai_gen_id }}">
        <a class="ai-what-you-get-cta-{{ ai_gen_id }}" href="{{ block.settings.cta_url }}">
          {{ block.settings.cta_label }}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    {% endif %}`

// Remove CTA from inside else-branch (wherever it currently sits before the flat_list closing endif)
const bad = `    {% if block.settings.cta_label != blank and block.settings.cta_url != blank %}
      <div class="ai-what-you-get-cta-wrap-{{ ai_gen_id }}">
        <a class="ai-what-you-get-cta-{{ ai_gen_id }}" href="{{ block.settings.cta_url }}">
          {{ block.settings.cta_label }}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    {% endif %}
    {% endif %}`

if (!wyg.includes(bad)) {
  // try without exact whitespace
  const re =
    /\n\s*\{% if block\.settings\.cta_label != blank and block\.settings\.cta_url != blank %\}[\s\S]*?\{% endif %\}\s*\n\s*\{% endif %\}/
  if (!re.test(wyg)) throw new Error('Could not locate CTA+endif pattern')
  wyg = wyg.replace(re, `\n    {% endif %}\n\n${ctaBlock}\n`)
} else {
  wyg = wyg.replace(bad, `    {% endif %}\n\n${ctaBlock}`)
}

// Verify CTA now appears after flat_list endif, not only in else
const flatIdx = wyg.indexOf('{% if block.settings.flat_list %}')
const elseIdx = wyg.indexOf('{% else %}', flatIdx)
const ctaIdx = wyg.indexOf('block.settings.cta_label', flatIdx)
const endifAfterElse = wyg.indexOf('{% endif %}', elseIdx)
console.log({ flatIdx, elseIdx, ctaIdx, ctaAfterFlatEndif: ctaIdx > endifAfterElse })

console.log('wyg put', await putAsset('blocks/ai_gen_block_68d702b.liquid', wyg))
fs.writeFileSync(path.join('scripts', 'tmp-patched-wyg-flat.liquid'), wyg)

const indexAsset = await getAsset('templates/index.json')
const index = JSON.parse(indexAsset.value.replace(/^\/\*[\s\S]*?\*\/\s*/, ''))
const wygKey = Object.keys(index.sections.blocks_C9E4qf.blocks).find((k) =>
  k.startsWith('ai_gen_block_68d702b')
)
Object.assign(index.sections.blocks_C9E4qf.blocks[wygKey].settings, {
  flat_list: true,
  paragraph: '',
  highlight_text:
    'Prize money up to ₹5,000 · Physical trophies · Virtual certificates · Monthly Consistency League — top 10% promote',
  cta_label: 'See the Consistency League →',
  cta_url: '/pages/league',
})
console.log('index put', await putAsset('templates/index.json', JSON.stringify(index, null, 2)))

console.log('done')
