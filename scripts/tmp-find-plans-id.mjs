import fs from 'node:fs'
import path from 'node:path'
const html = fs.readFileSync(path.join(process.env.TEMP, 'lx-plan-pages', 'home.html'), 'utf8')
const i = html.indexOf('id="plans"')
console.log('id=plans context:\n', html.slice(i - 250, i + 400))
const j = html.indexOf('Every plan includes this')
console.log('\nEvery plan includes context:\n', html.slice(j - 200, j + 300))
