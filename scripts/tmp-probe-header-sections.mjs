import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp-live-main')
const NEW = '161391804667'
const urls = [
  `https://www.lurvox.in/?sections=header-group&cb=${Date.now()}`,
  `https://www.lurvox.in/index?sections=header-group&cb=${Date.now()}`,
  `https://9uwyq1-0j.myshopify.com/?sections=header-group&preview_theme_id=${NEW}&cb=${Date.now()}`,
]

for (const u of urls) {
  const r = await fetch(u, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' },
  })
  const t = await r.text()
  const st = r.headers.get('server-timing') || ''
  console.log({
    u: u.slice(0, 90),
    status: r.status,
    stTheme: st.match(/theme;desc="(\d+)"/)?.[1],
    offer: t.includes('lurvox-offer-strip'),
    save5: t.includes('SAVE5'),
    old: t.includes('EXISTING CLIENT'),
    drawer: t.includes('lurvox-drawer-login'),
    len: t.length,
  })
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t)
      const keys = Object.keys(j)
      console.log('section keys', keys.slice(0, 8))
      const sample = String(j[keys[0]] || '').slice(0, 200)
      console.log('sample', sample.replace(/\s+/g, ' '))
    } catch {}
  }
}
