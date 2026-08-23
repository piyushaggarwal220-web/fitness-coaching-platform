import fs from 'node:fs'
import path from 'node:path'

const GQL = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const APP = 'https://app.lurvox.in'
const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
).access_token
const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const body = `<div style="max-width:720px;margin:0 auto;padding:24px 16px;color:#111;line-height:1.55;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
  <p style="letter-spacing:.12em;text-transform:uppercase;font-size:12px;font-weight:700;color:#ff6200;margin:0 0 8px;">LURVOX Coaching</p>
  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Choose your plan</h1>
  <p style="margin:0 0 20px;color:#444;">Same complete coaching on every plan. Longer plans cost less per month. Secure checkout opens on the LURVOX app.</p>
  <h2 style="margin:28px 0 10px;font-size:18px;">Everything included</h2>
  <ul style="margin:0 0 24px;padding-left:18px;color:#333;">
    <li>Personal workout plan (gym, home, or both)</li>
    <li>Personal diet plan (veg / non-veg / allergies supported)</li>
    <li>Weekly coach check-ins with a real human coach</li>
    <li>Direct coach chat inside the client app</li>
    <li>Daily trackers: workout, diet, water, sleep, steps, supplements + habits</li>
    <li>Progress photos, measurements, and journey timeline</li>
    <li>Weekly plan updates based on your real progress</li>
  </ul>
  <h2 style="margin:28px 0 10px;font-size:18px;">Plans</h2>
  <ol style="margin:0 0 8px;padding-left:18px;">
    <li style="margin-bottom:10px;"><strong>3 Months — ₹999</strong> (≈ ₹333/month · SAVE ₹498)<br/><a href="${APP}/plans/3-months">Start 3 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>6 Months — ₹1699</strong> (≈ ₹283/month · SAVE ₹1,295) · Most popular<br/><a href="${APP}/plans/6-months">Start 6 Months →</a></li>
    <li style="margin-bottom:10px;"><strong>12 Months — ₹2999</strong> (≈ ₹250/month · SAVE ₹2,989) · Best value<br/><a href="${APP}/plans/12-months">Start 12 Months →</a></li>
  </ol>
  <p style="margin:24px 0 8px;color:#444;">After payment: create account → assessment + photos → personal plan delivered within 24–48 hours.</p>
  <p style="margin:0;"><a href="/">Or view plans on the homepage →</a></p>
</div>`

const pages = await gql(`{ pages(first:50){nodes{id handle}}}`)
const current = pages.pages.nodes.find((p) => p.handle === 'plans')
const archived = pages.pages.nodes.find((p) => p.handle.startsWith('plans-archived-'))

// Move new page out of the way
if (current) {
  const r = await gql(
    `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){page{handle} userErrors{message}}}`,
    {
      id: current.id,
      page: { handle: `plans-new-${Date.now()}`, isPublished: false, title: 'PLANS new temp' },
    }
  )
  console.log('moved new', r.pageUpdate)
}

// Restore archived (the resourceId the CDN is serving) to handle plans with clean body
if (archived) {
  const r = await gql(
    `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id,page:$page){page{handle body} userErrors{message}}}`,
    {
      id: archived.id,
      page: {
        handle: 'plans',
        title: 'PLANS',
        body,
        isPublished: true,
      },
    }
  )
  console.log('restored archived as plans', {
    handle: r.pageUpdate.page?.handle,
    has1: /1 Month\s*—/.test(r.pageUpdate.page?.body || ''),
    errors: r.pageUpdate.userErrors,
  })
}

// Probe alternate URLs / headers that may bypass HTML cache
const probes = [
  'https://www.lurvox.in/pages/plans',
  'https://www.lurvox.in/pages/plans/',
  'https://www.lurvox.in/pages/plans?view=',
  'https://9uwyq1-0j.myshopify.com/pages/plans',
]

for (let round = 0; round < 6; round++) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const url of probes) {
    const html = await fetch(url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now() + round, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }).then((r) => r.text())
    const metaId = html.match(/resourceId:\s*(\d+)/)?.[1]
    const has1 = /1 Month\s*—/.test(html)
    const has3only = /3 Months\s*—/.test(html) && !has1
    if (has3only || round === 0) {
      console.log(round, url, { metaId, has1, has3only })
    }
    if (has3only) {
      console.log('SUCCESS on', url)
      process.exit(0)
    }
  }
}
console.log('still cached')
