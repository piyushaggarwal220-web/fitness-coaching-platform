import fs from 'node:fs'
import path from 'node:path'

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const dir = path.join(process.env.TEMP, 'lx-plan-verify')
const home = fs.readFileSync(path.join(dir, 'home.html'), 'utf8')
const lines = [...new Set(text(home))]
const start = lines.findIndex((l) => /Pick your goal/.test(l))
const end = lines.findIndex((l, i) => i > start && /What you get on the platform/.test(l))
console.log('===== HOME PLANS =====')
console.log(lines.slice(Math.max(0, start - 3), end > 0 ? end : start + 40).join('\n'))

const coaching = fs.readFileSync(path.join(dir, 'coaching.html'), 'utf8')
const i = coaching.indexOf('≈')
console.log('\n===== COACHING ≈ context =====')
console.log(i < 0 ? 'none in raw' : coaching.slice(i - 80, i + 80).replace(/\s+/g, ' '))

const choose = fs.readFileSync(path.join(dir, 'choose.html'), 'utf8')
const cl = [...new Set(text(choose))]
console.log('\n===== CHOOSE/QUIZ =====')
console.log(cl.filter((l) => !/cart|Search|Products|menu|Login|Account/i.test(l)).slice(0, 40).join('\n'))
