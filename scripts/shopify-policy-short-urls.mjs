/**
 * Bust CDN cache by publishing short-handle policy pages with visible content.
 * Also re-touch theme section so edges refresh.
 */
import fs from 'node:fs'
import path from 'node:path'

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)
const API = 'https://9uwyq1-0j.myshopify.com/admin/api/2025-01/graphql.json'
const SITE = 'https://www.lurvox.in'
const APP = 'https://app.lurvox.in'
const WA = 'https://wa.me/919220451577'
const PHONE = '+91 92204 51577'
const EMAIL = 'support@lurvox.in'

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
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

function body(inner) {
  return `<p><em>Last updated: 21 July 2026</em></p>${inner}<p>Questions? <a href="${WA}">WhatsApp ${PHONE}</a> · <a href="mailto:${EMAIL}">${EMAIL}</a></p>`
}

const defs = [
  {
    handle: 'privacy',
    title: 'Privacy Policy',
    body: body(`
<p>This Privacy Policy explains how LURVOX collects, uses, and protects your information on <a href="${SITE}">${SITE}</a> and <a href="${APP}">${APP}</a>.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Account:</strong> name, email, phone, login credentials.</li>
<li><strong>Payments:</strong> order/payment IDs and plan purchased (card/UPI handled by Razorpay — we do not store full card numbers).</li>
<li><strong>Coaching data:</strong> onboarding answers, goals, diet preferences, progress photos, measurements, check-ins, tracker logs, coach chat.</li>
<li><strong>Technical:</strong> device/browser, IP, security logs.</li>
</ul>
<h2>How we use information</h2>
<ul>
<li>Deliver coaching, plans, check-ins, and support.</li>
<li>Process payments and prevent fraud.</li>
<li>Improve product security and customer support.</li>
</ul>
<h2>Sharing</h2>
<ul>
<li>Assigned coaches/support staff, Razorpay, and infrastructure providers under confidentiality.</li>
<li>We do not sell personal data. We may disclose information if required by law.</li>
</ul>
<h2>Contact</h2>
<p><a href="mailto:${EMAIL}">${EMAIL}</a> · <a href="${WA}">${PHONE}</a></p>
`),
  },
  {
    handle: 'terms',
    title: 'Terms and Conditions',
    body: body(`
<p>By buying or using LURVOX services you agree to these Terms.</p>
<h2>Service</h2>
<p>Digital fitness coaching: personalised workout/diet plans, weekly check-ins, trackers, coach chat, and plan updates via our app.</p>
<h2>Eligibility</h2>
<ul>
<li>18+ (or guardian consent where required).</li>
<li>Provide accurate information. Consult a doctor before starting exercise/diet if you have medical conditions.</li>
</ul>
<h2>Payments</h2>
<p>Prices in INR. Paid via Razorpay. Access starts after successful payment and account setup.</p>
<h2>Results</h2>
<p>Results vary. No guaranteed specific weight/muscle/medical outcomes.</p>
<h2>Law</h2>
<p>Governed by the laws of India.</p>
`),
  },
  {
    handle: 'refund-policy',
    title: 'Refund and Cancellation Policy',
    body: body(`
<p>Applies to LURVOX digital coaching purchases.</p>
<h2>Product type</h2>
<p>Digital coaching only — no physical shipping.</p>
<h2>Cancellation</h2>
<p>Message WhatsApp <a href="${WA}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a> anytime.</p>
<h2>Refunds</h2>
<ul>
<li><strong>Duplicate/failed charge:</strong> refund within 5–7 business days after verification.</li>
<li><strong>Plan not delivered:</strong> if onboarding is complete and we do not deliver the first plan within 48 hours (excluding incomplete client info), full refund request within 7 days of purchase.</li>
<li><strong>After plan delivery / coaching use:</strong> generally non-refundable.</li>
</ul>
<h2>Request process</h2>
<ol>
<li>Send email used at checkout + Razorpay payment ID (<code>pay_…</code>).</li>
<li>We verify in 2–3 business days.</li>
<li>Approved refunds usually reflect in 5–7 business days.</li>
</ol>
`),
  },
  {
    handle: 'shipping',
    title: 'Shipping and Delivery Policy',
    body: body(`
<p>LURVOX delivers <strong>digital coaching only</strong>. No physical goods are shipped.</p>
<ul>
<li>Account access on <a href="${APP}">${APP}</a> after payment.</li>
<li>First personalised plan typically within 24 hours after onboarding + photos (up to 48 hours peak).</li>
<li>Ongoing coaching through your purchased duration.</li>
</ul>
`),
  },
  {
    handle: 'about',
    title: 'About Us',
    body: body(`
<p>LURVOX provides affordable personalised online fitness coaching.</p>
<ul>
<li>Personal workout + diet plans</li>
<li>Weekly coach check-ins and updates</li>
<li>Daily trackers and coach chat</li>
</ul>
<p><a href="${SITE}/pages/pricing">View pricing</a></p>
`),
  },
]

// Touch theme liquid so CDN template fingerprint changes
const liquid = fs.readFileSync(
  'C:/Users/DELL/coaching-platform/scripts/lurvox-page-content.liquid',
  'utf8'
).replace(
  'Simple readable page content',
  `Simple readable page content v${Date.now()}`
)

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [
      {
        filename: 'sections/lurvox-page-content.liquid',
        body: { type: 'TEXT', value: liquid },
      },
    ],
  }
)

const existing = await gql(`{ pages(first: 50) { nodes { id handle } } }`)
const byHandle = Object.fromEntries(existing.pages.nodes.map((p) => [p.handle, p]))

for (const def of defs) {
  if (byHandle[def.handle]) {
    const result = await gql(
      `mutation ($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page { handle }
          userErrors { field message }
        }
      }`,
      {
        id: byHandle[def.handle].id,
        page: {
          title: def.title,
          body: def.body,
          isPublished: true,
          templateSuffix: 'policy',
        },
      }
    )
    if (result.pageUpdate.userErrors?.length) console.warn(def.handle, result.pageUpdate.userErrors)
    else console.log('Updated', def.handle)
  } else {
    const result = await gql(
      `mutation ($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page { handle }
          userErrors { field message }
        }
      }`,
      {
        page: {
          title: def.title,
          handle: def.handle,
          body: def.body,
          isPublished: true,
          templateSuffix: 'policy',
        },
      }
    )
    if (result.pageCreate.userErrors?.length) console.warn(def.handle, result.pageCreate.userErrors)
    else console.log('Created', def.handle)
  }
}

// Also refresh long-handle pages with same bodies
const mapOld = {
  'privacy-policy': 'privacy',
  'terms-and-conditions': 'terms',
  'refund-and-cancellation-policy': 'refund-policy',
  'shipping-policy': 'shipping',
  'about-us': 'about',
}
for (const [oldHandle, newHandle] of Object.entries(mapOld)) {
  const src = defs.find((d) => d.handle === newHandle)
  const page = byHandle[oldHandle]
  if (!src || !page) continue
  const result = await gql(
    `mutation ($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { handle }
        userErrors { field message }
      }
    }`,
    {
      id: page.id,
      page: {
        title: src.title,
        body: src.body + `<p><a href="${SITE}/pages/${newHandle}">Open clean URL →</a></p>`,
        isPublished: true,
        templateSuffix: 'policy',
      },
    }
  )
  if (result.pageUpdate.userErrors?.length) console.warn(oldHandle, result.pageUpdate.userErrors)
  else console.log('Refreshed', oldHandle)
}

console.log('\nUse these URLs in Razorpay (hard-refresh if needed):')
for (const d of defs) console.log(`- ${SITE}/pages/${d.handle}`)
