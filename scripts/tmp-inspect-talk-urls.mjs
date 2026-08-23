import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token }

const themes = (await (await fetch(`${REST}/themes.json`, { headers })).json()).themes
const main = themes.find((t) => t.role === 'main')
console.log('main', main.id, main.name)

async function get(key) {
  const res = await fetch(
    `${REST}/themes/${main.id}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  return (await res.json()).asset?.value
}

for (const key of [
  'sections/header-group.json',
  'sections/footer-group.json',
]) {
  const raw = await get(key)
  if (!raw) {
    console.log(key, 'MISSING')
    continue
  }
  const cleaned = raw.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
  const j = JSON.parse(cleaned)
  const dump = []
  function walk(node, trail = '') {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, trail + `[${i}]`))
    const s = node.settings || {}
    for (const [k, v] of Object.entries(s)) {
      if (/talk|consult|whatsapp|wa\.me|coach/i.test(k + String(v))) {
        dump.push({ trail: trail + '.' + (node.type || ''), key: k, value: v })
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k !== 'settings') walk(v, trail + '/' + k)
    }
  }
  walk(j)
  console.log('\n===', key)
  console.log(JSON.stringify(dump, null, 2))
}

// live HTML talk links
const html = await fetch('https://www.lurvox.in/?view=&cb=' + Date.now(), {
  headers: { 'User-Agent': 'Mozilla/5.0' },
}).then((r) => r.text())
const links = [...html.matchAll(/href=["']([^"']*(?:talk|wa\.me|whatsapp)[^"']*)["']/gi)].map(
  (m) => m[1]
)
console.log('\nlive talk-ish hrefs', [...new Set(links)].slice(0, 30))
