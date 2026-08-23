/**
 * Verify autoplay was upserted to MAIN theme carousel blocks.
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`
const outDir = 'C:/Users/DELL/coaching-platform/scripts'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const live = JSON.parse(fs.readFileSync(path.join(outDir, 'tmp-live-theme-meta.json'), 'utf8'))

async function gql(query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token.access_token,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json, null, 2))
  return json.data
}

const names = [
  'blocks/ai_gen_block_52353f6.liquid',
  'blocks/ai_gen_block_a7d1b3c.liquid',
  'blocks/ai_gen_block_cd3c949.liquid',
  'blocks/ai_gen_block_3cbb200.liquid',
]

const data = await gql(
  `query($id: ID!, $names: [String!]!) {
    theme(id: $id) {
      name
      files(filenames: $names, first: 10) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: live.id, names }
)

const checks = data.theme.files.nodes.map((n) => {
  const c = n.body?.content ?? ''
  return {
    filename: n.filename,
    setupAutoplay: c.includes('setupAutoplay()'),
    setInterval: c.includes('setInterval'),
    pauseAutoplay: c.includes('pauseAutoplay()'),
    scheduleResume: c.includes('scheduleResumeAutoplay()'),
    autoMs3500: c.includes('3500'),
    resumeMs2500: c.includes('2500'),
    pointerdown: c.includes("addEventListener('pointerdown'"),
    mouseleave: c.includes("addEventListener('mouseleave'"),
  }
})

// Homepage presence of the three active carousels
let homepage = null
try {
  const html = await fetch('https://www.lurvox.in/?v=' + Date.now(), {
    headers: { 'Cache-Control': 'no-cache' },
  }).then((r) => r.text())
  homepage = {
    status: 'ok',
    hasFitness: html.includes('fitness-gallery-') || html.includes('ai-fitness-gallery'),
    hasMemberWins: html.includes('member-wins') || html.includes('ai-member-wins'),
    hasClientResults: html.includes('client-results') || html.includes('ai-client-results'),
    hasSetupAutoplayInHtml: html.includes('setupAutoplay'),
    hasSetIntervalInHtml: html.includes('setInterval') && html.includes('autoAdvance'),
  }
} catch (e) {
  homepage = { status: 'fetch_failed', error: String(e) }
}

console.log(JSON.stringify({ theme: data.theme.name, checks, homepage }, null, 2))
