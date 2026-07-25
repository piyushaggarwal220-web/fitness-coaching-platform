/**
 * Fill gaps on the live LURVOX homepage so every coaching offering is clear.
 * Updates MAIN theme templates/index.json settings only (no layout redesign).
 */
import fs from 'node:fs'
import path from 'node:path'

const STORE = '9uwyq1-0j.myshopify.com'
const API = `https://${STORE}/admin/api/2025-01/graphql.json`

const token = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP, 'shopify-auth-token.json'), 'utf8')
)

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

function stripAutoHeader(content) {
  return content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')
}

function findBlock(index, typePrefix) {
  for (const section of Object.values(index.sections || {})) {
    for (const [key, block] of Object.entries(section.blocks || {})) {
      if (block?.type === typePrefix || key.startsWith(typePrefix)) return block
    }
  }
  return null
}

const themes = await gql(`{ themes(first: 20) { nodes { id name role } } }`)
const main = themes.themes.nodes.find((t) => t.role === 'MAIN')
if (!main) throw new Error('No MAIN theme found')
console.log('Updating', main.name, main.id)

const fileData = await gql(
  `query ($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(filenames: $filenames) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`,
  { id: main.id, filenames: ['templates/index.json'] }
)

const raw = fileData.theme.files.nodes[0]?.body?.content
if (!raw) throw new Error('templates/index.json missing')
const index = JSON.parse(stripAutoHeader(raw))

// --- Pricing block: make inclusions explicit ---
const pricing = findBlock(index, 'ai_gen_block_361650c')
if (!pricing?.settings) throw new Error('Pricing block not found')
Object.assign(pricing.settings, {
  top_label: 'EVERY PLAN INCLUDES FULL COACHING',
  headline: 'Choose Your Plan',
  subheadline:
    'Same complete coaching on every plan — personal workout + diet, weekly coach reviews, daily trackers, coach chat, progress photos, and weekly plan updates. Longer plans simply cost less per month.',
  plan_1_description:
    'Full coaching access for 1 month. Perfect if you want to experience the system first.',
  plan_2_description:
    'Full coaching for 3 months — enough time to build habits with weekly accountability.',
  plan_3_description:
    'Full coaching for 6 months. Best balance of results, support, and value.',
  plan_4_description:
    'Full coaching for 12 months. Lowest monthly cost and maximum consistency support.',
  trust_item_1: 'Personal Workout + Diet',
  trust_item_2: 'Weekly Coach Check-ins',
  trust_item_3: 'Daily Trackers + Coach Chat',
  trust_item_4: 'Plan Updates From Real Data',
})

// --- Process strip: clarify the real method ---
const processStrip = findBlock(index, 'ai_gen_block_973d4c3')
if (processStrip?.settings) {
  Object.assign(processStrip.settings, {
    feature_1: 'PERSONAL WORKOUT',
    feature_2: 'PERSONAL DIET',
    feature_3: 'WEEKLY CHECK-INS',
    feature_4: 'COACH CHAT',
    process_step_1_highlight: 'Assessment',
    process_step_1_text: '+',
    process_step_1_highlight_2: 'Progress Photos',
    process_step_2_text_1: 'Personal Plan + Weekly Coaching + Daily Trackers',
    process_step_2_text_2: 'First plan delivered within',
    process_step_2_highlight: '24–48 Hours',
  })
}

// --- What You Get: cover every product surface (no false video-library claim) ---
const whatYouGet = findBlock(index, 'ai_gen_block_68d702b')
if (!whatYouGet?.settings) throw new Error('What You Get block not found')
Object.assign(whatYouGet.settings, {
  eyebrow_text: 'EVERYTHING INCLUDED',
  headline: 'What you get with LURVOX coaching.',
  paragraph:
    'No upsells. No hidden fees.\nOne price covers personal coaching end to end — plans, trackers, chat, check-ins, and weekly updates.',
  highlight_text:
    'Built for gym, home, or both.\nVegetarian, vegan, and allergy-friendly diets included.\nBeginners welcome.',
  card_1_title: 'PERSONAL TRAINING',
  card_1_item_1_title: 'Personal workout plan',
  card_1_item_1_description:
    'Built for your goal, experience level, schedule, and equipment — gym, home, or mixed.',
  card_1_item_2_title: 'Clear sessions & progressions',
  card_1_item_2_description:
    'Exercises, sets, and progressions so you always know what to do next.',
  card_1_item_3_title: 'Weekly plan updates',
  card_1_item_3_description:
    'Your training changes based on what is actually happening in your check-ins.',
  card_2_title: 'PERSONAL NUTRITION',
  card_2_item_1_title: 'Personal diet plan',
  card_2_item_1_description:
    'Custom meals and macros around your preferences, allergies, and real schedule.',
  card_2_item_2_title: 'Flexible food structure',
  card_2_item_2_description:
    'Sustainable guidance — not crash diets or unrealistic restrictions.',
  card_2_item_3_title: 'Optional supplement guidance',
  card_2_item_3_description:
    'Know what helps and what to skip. Results still come from food + training.',
  card_3_title: 'DAILY TRACKERS',
  card_3_item_1_title: 'Workout + diet trackers',
  card_3_item_1_description:
    'Log sessions and meals daily so adherence is visible to you and your coach.',
  card_3_item_2_title: 'Water, sleep, steps, supplements',
  card_3_item_2_description:
    'Recovery and habit tracking that supports fat loss and muscle progress.',
  card_3_item_3_title: 'Habit tracker',
  card_3_item_3_description:
    'Build consistency with daily checkpoints that keep momentum alive.',
  card_4_title: 'COACHING & PROGRESS',
  card_4_item_1_title: 'Weekly coach check-ins',
  card_4_item_1_description:
    'Structured reviews with a real coach — not a chatbot and not a static PDF.',
  card_4_item_2_title: 'Direct coach chat',
  card_4_item_2_description:
    'Message your coach when you need clarity on training, diet, or adherence.',
  card_4_item_3_title: 'Photos, measurements & journey',
  card_4_item_3_description:
    'Progress photos, weight/measurements, and your full coaching timeline in one place.',
})

// --- Comparison: fill missing product truths ---
const compare = findBlock(index, 'ai_gen_block_99f4724')
if (compare?.settings) {
  Object.assign(compare.settings, {
    headline: 'NOT A PDF. REAL COACHING BUILT AROUND YOU.',
    subheadline:
      'Personal workout + diet, weekly reviews, daily trackers, and direct coach chat — adjusted from your photos and progress, not a one-size template.',
    feature_1_title: 'Weekly check-ins that stop plateaus',
    feature_1_desc: 'A real coach reviews progress and updates your plan',
    feature_2_title: 'Personal workout + diet',
    feature_2_desc: 'Built for your body, schedule, food prefs, and equipment',
    feature_3_title: 'Daily habit & health trackers',
    feature_3_desc: 'Workout, diet, water, sleep, steps, and supplements',
    feature_4_title: 'Direct coach chat',
    feature_4_desc: 'Get answers when you are stuck — inside the client app',
    feature_5_title: 'Progress photos & journey',
    feature_5_desc: 'Visual proof and a timeline of check-ins and updates',
    feature_6_title: 'Gym, home, or both',
    feature_6_desc: 'Programming matches what you actually have access to',
    feature_7_title: 'Vegetarian & beginner friendly',
    feature_7_desc: 'Plans match your experience and dietary needs',
    feature_8_title: 'Built from your assessment + photos',
    feature_8_desc: 'Personalized from day one by a human coach',
    feature_9_title: 'Plan updates from real data',
    feature_9_desc: 'Adjustments based on adherence, recovery, and results',
    feature_10_title: 'One price — no coaching upsells',
    feature_10_desc: 'Full coaching included on every plan length',
  })
}

// --- FAQ: complete, accurate answers ---
const faq = findBlock(index, 'ai_gen_block_66d8696')
if (!faq?.settings) throw new Error('FAQ block not found')
Object.assign(faq.settings, {
  eyebrow: 'FAQ',
  headline: 'Questions Before You Start',
  subheadline: 'Clear answers about coaching, what is included, and how the system works.',
  question_1: 'HOW DOES IT WORK?',
  answer_1:
    'After checkout you create your account, complete an assessment with progress photos, and receive a personal workout + diet plan within 24–48 hours. Then you train, track daily (workout, diet, water, sleep, steps, supplements), message your coach when needed, and submit weekly check-ins so your plan gets updated.',
  question_2: 'WHAT DO I GET?',
  answer_2:
    'Every plan includes: personal workout plan, personal diet plan, weekly coach check-ins, daily trackers (workout, diet, water, sleep, steps, supplements + habits), direct coach chat, progress photos, journey timeline, and weekly plan updates. No separate upsells for core coaching.',
  question_3: 'WILL I GET A REAL COACH?',
  answer_3:
    'Yes. A human coach reviews your assessment, check-ins, and progress. Tools help them work faster — they do not replace the coach. You also get direct coach chat inside the app.',
  question_4: 'GYM OR HOME? BEGINNERS? VEGETARIANS?',
  answer_4:
    'All welcome. Plans are built for gym, home, or mixed setups, matched to your experience level, and diet is customized for vegetarian, vegan, and allergy needs.',
  question_5: 'WHY IS IT AFFORDABLE?',
  answer_5:
    'Traditional coaching prices include hours of admin. Our coaches use smart tools for repetitive work like plan drafting and progress analysis, so more time goes into actual coaching — premium guidance without luxury-studio pricing.',
  question_6: 'WHAT IF I MISS WORKOUTS OR WANT TO CANCEL?',
  answer_6:
    'Tell your coach on the next check-in — plans adjust for busy weeks, travel, and missed sessions. Consistency over perfection. To cancel, message us on WhatsApp and we will process it without pressure games.',
})

// --- Final CTA copy ---
const ctas = []
for (const section of Object.values(index.sections || {})) {
  for (const block of Object.values(section.blocks || {})) {
    if (block?.type === 'ai_gen_block_8d967d7' && block.settings) ctas.push(block.settings)
  }
}
if (ctas[0]) {
  Object.assign(ctas[0], {
    headline: 'Choose your LURVOX plan.',
    subheadline:
      'Checkout → create account → assessment + photos → personal plan within 24–48 hours. Full coaching included.',
  })
}
if (ctas[1]) {
  Object.assign(ctas[1], {
    headline: 'Pick your plan. Start Day 1.',
    subheadline:
      'Personal workout + diet, weekly check-ins, daily trackers, and coach chat — all included.',
  })
}

const nextJson = JSON.stringify(index, null, 2)
fs.writeFileSync(path.join('scripts', 'tmp-live-index-updated.json'), nextJson)

const upsert = await gql(
  `mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message }
    }
  }`,
  {
    themeId: main.id,
    files: [{ filename: 'templates/index.json', body: { type: 'TEXT', value: nextJson } }],
  }
)

if (upsert.themeFilesUpsert.userErrors?.length) {
  throw new Error(JSON.stringify(upsert.themeFilesUpsert.userErrors, null, 2))
}

console.log('Updated files:', upsert.themeFilesUpsert.upsertedThemeFiles.map((f) => f.filename))
console.log('Done — offerings copy refreshed on', main.name)
