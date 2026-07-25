/**
 * Force policy pages to render readable content on dark theme.
 * 1) Upload custom section that prints page.content in light text
 * 2) Point page.policy.json at that section only
 * 3) Rewrite page bodies without dark (#111) inline colors
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
const ADDRESS_LINE =
  'LURVOX — India. For the full registered business address, contact us on WhatsApp or email below.'

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

function wrap(inner) {
  // No inline color:#111 — theme section forces light text.
  return `
<p><em>Last updated: 20 July 2026</em></p>
${inner}
<p>Questions? <a href="${WA}">WhatsApp ${PHONE}</a> · <a href="mailto:${EMAIL}">${EMAIL}</a> · <a href="${SITE}/pages/contact">Contact</a></p>
`.trim()
}

const pages = [
  {
    handle: 'privacy-policy',
    title: 'Privacy Policy',
    body: wrap(`
<p>This Privacy Policy explains how LURVOX ("we", "us", "our") collects, uses, and protects your information when you use <a href="${SITE}">${SITE}</a>, our coaching app at <a href="${APP}">${APP}</a>, and related payment flows.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Account & identity:</strong> name, email address, phone number (if provided), and login credentials.</li>
<li><strong>Payment information:</strong> payment status, order/payment IDs, and plan purchased. Card/UPI details are processed by Razorpay — we do not store full card numbers on our servers.</li>
<li><strong>Coaching data:</strong> onboarding answers, goals, diet preferences, progress photos, measurements, check-ins, tracker logs, and chat messages with your coach.</li>
<li><strong>Technical data:</strong> device/browser type, IP address, and basic usage logs needed for security and support.</li>
</ul>
<h2>How we use your information</h2>
<ul>
<li>To create and manage your coaching account and deliver personalised workout and diet plans.</li>
<li>To process payments, prevent fraud, and provide purchase support.</li>
<li>To enable coach communication, weekly check-ins, plan updates, and progress tracking.</li>
<li>To send service messages (account, payment, plan delivery, support).</li>
<li>To improve product quality, security, and customer support.</li>
</ul>
<h2>Sharing of information</h2>
<ul>
<li><strong>Coaches / support staff</strong> assigned to your account (to deliver coaching).</li>
<li><strong>Payment processor:</strong> Razorpay (to complete checkout and settlements).</li>
<li><strong>Infrastructure providers</strong> that host our app/database (under contractual confidentiality).</li>
<li>We do <strong>not sell</strong> your personal data.</li>
<li>We may disclose information if required by law or to protect rights, safety, and security.</li>
</ul>
<h2>Data retention & security</h2>
<p>We retain account and coaching records for as long as your account is active and as needed for legal, tax, dispute, and service purposes. We use reasonable technical and organisational measures to protect your data.</p>
<h2>Your choices</h2>
<ul>
<li>You may request access, correction, or deletion of your account data by contacting us.</li>
<li>You may stop coaching / request cancellation via WhatsApp support.</li>
</ul>
<h2>Contact for privacy requests</h2>
<p>Email: <a href="mailto:${EMAIL}">${EMAIL}</a><br>WhatsApp: <a href="${WA}">${PHONE}</a></p>
`),
  },
  {
    handle: 'terms-and-conditions',
    title: 'Terms and Conditions',
    body: wrap(`
<p>By purchasing or using LURVOX coaching services via <a href="${SITE}">${SITE}</a> or <a href="${APP}">${APP}</a>, you agree to these Terms.</p>
<h2>Service description</h2>
<p>LURVOX provides online fitness coaching, including personalised workout and diet guidance, weekly coach check-ins, daily tracking tools, coach chat, and plan updates. Coaching is delivered digitally through our app after payment and account setup.</p>
<h2>Eligibility</h2>
<ul>
<li>You must be 18+ (or have legal guardian consent where applicable).</li>
<li>You confirm information you provide is accurate.</li>
<li>You are responsible for consulting a doctor before starting any exercise or diet program if you have medical conditions.</li>
</ul>
<h2>Accounts & access</h2>
<ul>
<li>After payment you create an account, complete onboarding, and receive coaching access for the plan duration purchased.</li>
<li>You must keep login credentials confidential. Sharing accounts is not allowed.</li>
</ul>
<h2>Payments</h2>
<ul>
<li>Prices are listed in INR and paid securely via Razorpay.</li>
<li>Access begins after successful payment and account setup.</li>
</ul>
<h2>Results disclaimer</h2>
<p>Results vary. We do not guarantee specific weight loss, muscle gain, or medical outcomes.</p>
<h2>Governing law</h2>
<p>These Terms are governed by the laws of India.</p>
`),
  },
  {
    handle: 'refund-and-cancellation-policy',
    title: 'Refund and Cancellation Policy',
    body: wrap(`
<p>This policy applies to LURVOX digital coaching plan purchases made via <a href="${SITE}">${SITE}</a> / <a href="${APP}">${APP}</a>.</p>
<h2>Nature of the product</h2>
<p>LURVOX sells <strong>digital coaching services</strong>. There is no physical product shipment.</p>
<h2>Cancellation</h2>
<ul>
<li>Request cancellation anytime via WhatsApp <a href="${WA}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a>.</li>
<li>Cancellation stops future coaching beyond your paid period; refunds follow the rules below.</li>
</ul>
<h2>Refund eligibility</h2>
<ul>
<li><strong>Duplicate / failed payment:</strong> Refunded within <strong>5–7 business days</strong> after verification.</li>
<li><strong>Plan not delivered:</strong> If you completed payment + account + onboarding and we fail to deliver your first personalised plan within <strong>48 hours</strong> of onboarding completion (excluding delays from incomplete client info), you may request a full refund within <strong>7 days</strong> of purchase.</li>
<li><strong>After plan delivery:</strong> Once your personalised diet/workout plan has been delivered and/or you have started using coaching chat/check-ins, fees are generally <strong>non-refundable</strong>.</li>
</ul>
<h2>How to request a refund</h2>
<ol>
<li>WhatsApp <a href="${WA}">${PHONE}</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a> with your registered email and Razorpay payment ID (<code>pay_…</code>).</li>
<li>We verify within <strong>2–3 business days</strong>.</li>
<li>Approved refunds typically reflect in <strong>5–7 business days</strong>.</li>
</ol>
`),
  },
  {
    handle: 'shipping-policy',
    title: 'Shipping and Delivery Policy',
    body: wrap(`
<p>LURVOX provides <strong>digital coaching services only</strong>. We do not ship physical goods.</p>
<h2>What is delivered</h2>
<ul>
<li>Account access on <a href="${APP}">${APP}</a></li>
<li>Personalised workout plan and diet plan</li>
<li>Weekly coach check-ins, coach chat, daily trackers, progress tools</li>
</ul>
<h2>Delivery timeline</h2>
<ol>
<li><strong>Immediate:</strong> After successful payment you can create/claim your account.</li>
<li><strong>After onboarding + photos:</strong> First personalised plan typically within <strong>24 hours</strong> (up to <strong>48 hours</strong> in peak periods).</li>
<li>Ongoing coaching continues through your purchased plan duration.</li>
</ol>
<p>All deliverables are provided digitally inside the LURVOX client app.</p>
`),
  },
  {
    handle: 'about-us',
    title: 'About Us',
    body: wrap(`
<p>LURVOX is an online fitness coaching platform that helps people get personalised workout and diet coaching without luxury-studio pricing.</p>
<h2>What we do</h2>
<ul>
<li>Personal workout plans (gym, home, or both)</li>
<li>Personal diet plans (including vegetarian and allergy-friendly options)</li>
<li>Weekly coach check-ins and plan updates</li>
<li>Daily trackers and direct coach chat in our client app</li>
</ul>
<p>Explore plans: <a href="${SITE}/pages/plans">${SITE}/pages/plans</a> · <a href="${SITE}/pages/pricing">Pricing</a></p>
`),
  },
  {
    handle: 'pricing',
    title: 'Pricing',
    body: wrap(`
<p>All prices are in Indian Rupees (INR). Every plan includes the same complete coaching: personal workout + diet, weekly check-ins, daily trackers, coach chat, progress photos/journey, and weekly plan updates.</p>
<h2>Current plans</h2>
<ul>
<li><strong>1 Month — ₹499</strong> — <a href="${APP}/checkout?plan=1_month">Checkout</a></li>
<li><strong>3 Months — ₹999</strong> (≈ ₹333/month) — <a href="${APP}/checkout?plan=3_months">Checkout</a></li>
<li><strong>6 Months — ₹1699</strong> (≈ ₹283/month) — <a href="${APP}/checkout?plan=6_months">Checkout</a></li>
<li><strong>12 Months — ₹2999</strong> (≈ ₹250/month) — <a href="${APP}/checkout?plan=12_months">Checkout</a></li>
</ul>
<p>Payments are processed securely via Razorpay. See our <a href="${SITE}/pages/refund-and-cancellation-policy">Refund and Cancellation Policy</a>.</p>
`),
  },
  {
    handle: 'contact',
    title: 'Contact',
    body: wrap(`
<p>We are here to help with payments, coaching access, and support.</p>
<h2>Support channels</h2>
<ul>
<li><strong>WhatsApp:</strong> <a href="${WA}">${PHONE}</a></li>
<li><strong>Email:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a></li>
<li><strong>Talk to a coach:</strong> <a href="${SITE}/pages/talk-to-a-coach">Request a free consultation</a></li>
<li><strong>Client app login:</strong> <a href="${APP}/login">${APP}/login</a></li>
</ul>
<h2>Business / registered address</h2>
<p>${ADDRESS_LINE}</p>
<p><strong>Brand:</strong> LURVOX<br><strong>Website:</strong> <a href="${SITE}">${SITE}</a><br><strong>App:</strong> <a href="${APP}">${APP}</a></p>
<p>We typically respond within <strong>24 hours</strong> on business days.</p>
`),
  },
]

const liquid = fs.readFileSync(
  path.join('C:/Users/DELL/coaching-platform/scripts/lurvox-page-content.liquid'),
  'utf8'
)

const policyTemplate = {
  sections: {
    lurvox_page_content: {
      type: 'lurvox-page-content',
      settings: {},
    },
  },
  order: ['lurvox_page_content'],
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')

const upsertTheme = await gql(
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
      {
        filename: 'templates/page.policy.json',
        body: { type: 'TEXT', value: JSON.stringify(policyTemplate, null, 2) },
      },
      {
        filename: 'templates/page.json',
        body: { type: 'TEXT', value: JSON.stringify(policyTemplate, null, 2) },
      },
    ],
  }
)
if (upsertTheme.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsertTheme.themeFilesUpsert.userErrors, null, 2))
}
console.log('Theme files', upsertTheme.themeFilesUpsert.upsertedThemeFiles)

const all = await gql(`{ pages(first: 50) { nodes { id handle } } }`)
for (const page of pages) {
  const found = all.pages.nodes.find((p) => p.handle === page.handle)
  if (!found) {
    console.warn('Missing page', page.handle)
    continue
  }
  const result = await gql(
    `mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
      pageUpdate(id: $id, page: $page) {
        page { handle templateSuffix }
        userErrors { field message }
      }
    }`,
    {
      id: found.id,
      page: {
        title: page.title,
        body: page.body,
        isPublished: true,
        templateSuffix: page.handle === 'contact' ? 'policy' : 'policy',
      },
    }
  )
  if (result.pageUpdate.userErrors?.length) {
    console.warn(page.handle, result.pageUpdate.userErrors)
  } else {
    console.log('Updated', page.handle)
  }
}

console.log('\nOpen https://www.lurvox.in/pages/privacy-policy?v=' + Date.now())
