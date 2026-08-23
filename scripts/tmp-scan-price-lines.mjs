import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const headers = { 'X-Shopify-Access-Token': token }
const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

const keys = [
  'snippets/lurvox-conversion-boost.liquid',
  'blocks/ai_gen_block_52353f6.liquid',
  'sections/lurvox-home-redesign.liquid',
  'sections/lurvox-plan-compare.liquid',
  'snippets/lurvox-plan-compare-inline.liquid',
]

for (const key of keys) {
  const val = await get(key)
  if (!val) {
    console.log('\n', key, 'MISSING')
    continue
  }
  const lines = val.split(/\n/)
  const hits = []
  lines.forEach((line, i) => {
    if (/566|2,?699|3,?699|1,?699|999|333|283|250|From ₹|START AT|button_text|plan_.*price/.test(line)) {
      hits.push(`${i + 1}: ${line.trim().slice(0, 160)}`)
    }
  })
  console.log('\n==', key, 'hits', hits.length)
  console.log(hits.slice(0, 25).join('\n'))
}
