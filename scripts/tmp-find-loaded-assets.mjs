import fs from 'node:fs'
import path from 'node:path'

const html = fs.readFileSync(path.join(process.env.TEMP, 'lurvox-offer-probe.html'), 'utf8')
const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/gi)].map((m) => m[1])
console.log('script count', scripts.length)
for (const s of [...new Set(scripts)]) {
  if (/cdn|assets|lurvox|theme|global|critical/i.test(s)) console.log(s)
}

const css = [...html.matchAll(/href="([^"]+\.css[^"]*)"/gi)].map((m) => m[1])
console.log('\ncss:')
for (const s of [...new Set(css)].slice(0, 20)) console.log(s)

console.log('\ntheme nums', [...new Set([...html.matchAll(/\/t\/(\d+)\//g)].map((m) => m[1]))])
console.log('Shopify.theme', html.match(/Shopify\.theme\s*=\s*\{[^}]+\}/)?.[0]?.slice(0, 200))
