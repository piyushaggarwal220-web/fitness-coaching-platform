import fs from 'node:fs'
import path from 'node:path'

const REST = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01'
const THEME = '161086767355'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

async function getAsset(key) {
  const res = await fetch(
    `${REST}/themes/${THEME}/assets.json?asset[key]=${encodeURIComponent(key)}&t=${Date.now()}`,
    { headers }
  )
  if (!res.ok) return null
  return (await res.json()).asset?.value ?? null
}

const assetsRes = await fetch(`${REST}/themes/${THEME}/assets.json`, { headers })
const allAssets = (await assetsRes.json()).assets.map((a) => a.key)
const sectionKeys = new Set(allAssets.filter((k) => k.startsWith('sections/')))
const blockKeys = new Set(allAssets.filter((k) => k.startsWith('blocks/')))

const TEMPLATES = [
  'templates/page.league-v2.json',
  'templates/page.league.json',
  'templates/page.consistency-league.json',
  'templates/page.json',
]

const out = []
for (const key of TEMPLATES) {
  const src = await getAsset(key)
  if (src === null) {
    out.push({ key, missing: true })
    continue
  }
  fs.writeFileSync(path.join(outDir, `tmp-audit-${key.replace(/[/]/g, '-')}`), src, 'utf8')

  let parsed = null
  let parseError = null
  try {
    parsed = JSON.parse(src)
  } catch (err) {
    parseError = String(err && err.message).slice(0, 200)
  }

  const entry = { key, bytes: src.length, parseError }
  if (parsed) {
    const sections = parsed.sections || {}
    entry.sectionOrder = parsed.order
    entry.sections = Object.entries(sections).map(([id, s]) => {
      const type = s.type
      const sectionFile = `sections/${type}.liquid`
      const blocks = s.blocks ? Object.values(s.blocks).map((b) => b.type) : []
      return {
        id,
        type,
        sectionFileExists: sectionKeys.has(sectionFile),
        missingBlockTypes: blocks.filter(
          (t) => t && !t.startsWith('_') && !blockKeys.has(`blocks/${t}.liquid`)
        ),
      }
    })
  }
  out.push(entry)
}

const leagueSection = await getAsset('sections/lurvox-league.liquid')
if (leagueSection) {
  fs.writeFileSync(path.join(outDir, 'tmp-audit-sections-lurvox-league.liquid'), leagueSection, 'utf8')
}

console.log(
  JSON.stringify(
    {
      templates: out,
      leagueSection: leagueSection
        ? {
            bytes: leagueSection.length,
            hasSchema: leagueSection.includes('{% schema %}'),
            schemaCount: (leagueSection.match(/\{%\s*schema\s*%\}/g) || []).length,
            hasCrazyEligibility: leagueSection.includes('crazy-eligibility'),
            liquidTagBalance: {
              ifs: (leagueSection.match(/\{%-?\s*if /g) || []).length,
              endifs: (leagueSection.match(/\{%-?\s*endif/g) || []).length,
              fors: (leagueSection.match(/\{%-?\s*for /g) || []).length,
              endfors: (leagueSection.match(/\{%-?\s*endfor/g) || []).length,
            },
          }
        : { missing: true },
    },
    null,
    2
  )
)
