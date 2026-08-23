import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const mainId = 161429127419
const headers = { 'X-Shopify-Access-Token': token }

const get = async (key) => {
  const res = await fetch(
    `${REST}/themes/${mainId}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return JSON.parse(await res.text()).asset?.value ?? null
}

const index = await get('templates/index.json')
const idx = index.indexOf('lurvox-plan-compare-inline')
console.log('context around render:', index.slice(Math.max(0, idx - 200), idx + 200))

// Also dump any custom.liquid / liquid settings containing 2699
const j = JSON.parse(index)
for (const [sid, sec] of Object.entries(j.sections || {})) {
  const raw = JSON.stringify(sec)
  if (/2,?699|plan-compare-inline|lx-matrix|custom_liquid|liquid/.test(raw)) {
    console.log('\nsection', sid, sec.type)
    if (sec.settings) {
      for (const [k, v] of Object.entries(sec.settings)) {
        if (typeof v === 'string' && (/2699|1699|matrix|compare|render/.test(v) || v.length > 200)) {
          console.log(' setting', k, v.slice(0, 240).replace(/\s+/g, ' '))
        }
      }
    }
    for (const [bk, b] of Object.entries(sec.blocks || {})) {
      const bs = JSON.stringify(b)
      if (/2699|plan-compare|matrix|render/.test(bs)) {
        console.log(' block', bk, b.type, bs.slice(0, 300).replace(/\s+/g, ' '))
      }
    }
  }
}
