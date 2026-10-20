/**
 * Verifies promo / referral code helpers.
 * Run: npx tsx scripts/verify-promo-codes.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  affiliateDiscountPaise,
  affiliateSalePaise,
  getAffiliateCode,
  isAffiliateDiscountCode,
} from '../src/lib/payments/affiliate-codes'
import {
  computePromoDiscountPaise,
  isPromoCodeCurrentlyValid,
  normalizePromoCode,
} from '../src/lib/payments/promo-codes'
import {
  expectedAmountPaiseFromOrderNotes,
  isRetiredPublicDiscountCode,
  isPublicSaleCode,
  publicSaleDiscountPaise,
} from '../src/lib/payments/checkout-discounts'
import { COACHING_PLANS, DURATION_OFFER_PLANS } from '../src/lib/payments/plans'
import { isPreviewSaleCode, previewSaleDiscountPaise } from '../src/lib/payments/preview-sale-code'
import { preview7MarkedUpPaise, preview7PricedPlan } from '../src/lib/payments/preview7-prices'
import { injectPreview7Tracking } from '../src/lib/landing/preview7-tracking'
import { applyPreview7Sale, preview7SaleAt, preview7StorefrontHtml, PREVIEW7_SALE_CYCLE_MS, PREVIEW7_SALE_EPOCH_MS } from '../src/lib/payments/preview7-sale'

function pass(label: string) {
  console.log(`  ✓ ${label}`)
}

assert.equal(normalizePromoCode('  summer 200 '), 'SUMMER200')
pass('normalizes promo codes')

const fixed = computePromoDiscountPaise(
  {
    discount_type: 'fixed',
    discount_paise: 25000,
    discount_percent: 0,
    plan_discounts_paise: {},
    applicable_plans: null,
  },
  '3_months',
  149900
)
assert.equal(fixed, 25000)
pass('computes fixed discount')

const percent = computePromoDiscountPaise(
  {
    discount_type: 'percent',
    discount_paise: 0,
    discount_percent: 10,
    plan_discounts_paise: {},
    applicable_plans: ['6_months'],
  },
  '6_months',
  99900
)
assert.equal(percent, 9990)
pass('computes percent discount for allowed plan')

assert.equal(
  computePromoDiscountPaise(
    {
      discount_type: 'percent',
      discount_paise: 0,
      discount_percent: 10,
      plan_discounts_paise: {},
      applicable_plans: ['6_months'],
    },
    '3_months',
    149900
  ),
  null
)
pass('rejects plan outside allow-list')

assert.equal(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 2,
    expires_at: null,
  }),
  null
)
pass('active code with uses is valid')

assert.match(
  isPromoCodeCurrentlyValid({
    is_active: true,
    remaining_uses: 0,
    expires_at: null,
  }) ?? '',
  /no uses/i
)
pass('exhausted code is invalid')

const list3 = COACHING_PLANS['3_months'].amountPaise
const expected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: String(list3 - 20000),
  list_amount_paise: String(list3),
  discount_paise: '20000',
  discount_code: 'PARTNER50',
})
assert.equal(expected, list3 - 20000)
pass('order notes accept generic promo amounts')

const modules = readFileSync(resolve('src/lib/admin/modules.ts'), 'utf8')
assert.match(modules, /promo-codes/)
assert.match(modules, /Discount & Referral Codes/)
pass('admin nav registers promo codes module')

const migration = readFileSync(
  resolve('supabase/migrations/20260803100000_promo_codes.sql'),
  'utf8'
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.promo_codes/)
assert.match(migration, /kind text NOT NULL CHECK \(kind IN \('discount', 'referral'\)\)/)
pass('migration creates promo_codes with discount/referral kinds')

assert.equal(isRetiredPublicDiscountCode('welcome60'), true)
assert.equal(isRetiredPublicDiscountCode('SUMMER60'), true)
assert.equal(isRetiredPublicDiscountCode('LUKE'), false)
assert.equal(isPublicSaleCode('summer60'), true)
assert.equal(publicSaleDiscountPaise(59900), null)
assert.equal(publicSaleDiscountPaise(99900), null)
assert.equal(publicSaleDiscountPaise(169900), null)
pass('WELCOME60 and SUMMER60 are retired; catalog prices are the public offer')

assert.equal(isAffiliateDiscountCode('luke'), true)
assert.equal(getAffiliateCode('LUKE')?.extraPercentOffSale, 5)
assert.equal(affiliateSalePaise('LUKE', '3_months'), 56900)
assert.equal(affiliateSalePaise('LUKE', '6_months'), 94900)
assert.equal(affiliateSalePaise('LUKE', '12_months'), 161400)
assert.equal(affiliateDiscountPaise('LUKE', '3_months', 59900), 3000)
assert.equal(affiliateDiscountPaise('LUKE', '6_months', 99900), 5000)
assert.equal(affiliateDiscountPaise('LUKE', '12_months', 169900), 8500)
pass('LUKE affiliate code is catalog price + 5% (₹569 / ₹949 / ₹1,614)')

const lukeExpected = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '56900',
  list_amount_paise: '59900',
  discount_paise: '3000',
  discount_code: 'LUKE',
})
assert.equal(lukeExpected, 56900)
pass('order notes accept LUKE affiliate amounts')

const previewOne = DURATION_OFFER_PLANS.offer_1_month
const previewThree = DURATION_OFFER_PLANS.offer_3_months
assert.equal(isPreviewSaleCode('lurvox60'), true)
assert.equal(previewSaleDiscountPaise(previewOne.amountPaise), 14940)
assert.equal(previewOne.amountPaise - previewSaleDiscountPaise(previewOne.amountPaise), 9960)
assert.equal(previewThree.amountPaise - previewSaleDiscountPaise(previewThree.amountPaise), 19960)
const previewNotes = expectedAmountPaiseFromOrderNotes(previewOne, {
  amount_paise: '9960',
  list_amount_paise: String(previewOne.amountPaise),
  discount_paise: '14940',
  discount_code: 'LURVOX60',
})
assert.equal(previewNotes, 9960)
const previewFull = expectedAmountPaiseFromOrderNotes(previewOne, {
  amount_paise: String(previewOne.amountPaise),
  list_amount_paise: String(previewOne.amountPaise),
})
assert.equal(previewFull, previewOne.amountPaise)
pass('LURVOX60 is 60% off preview 1-month and 3-month prices only when the code is on the order')

const preview7Notes = expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
  amount_paise: '199900',
  list_amount_paise: '199900',
})
assert.equal(preview7Notes, 199900)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
    amount_paise: '349900',
    list_amount_paise: '349900',
  }),
  349900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['12_months'], {
    amount_paise: '599900',
    list_amount_paise: '599900',
  }),
  599900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '59900',
    list_amount_paise: '59900',
  }),
  59900
)
pass('preview 7 draft prices verify at ₹1,999 / ₹3,499 / ₹5,999 and catalog orders stay at catalog')

assert.equal(preview7MarkedUpPaise(199900), 340000)
assert.equal(preview7MarkedUpPaise(349900), 595000)
assert.equal(preview7MarkedUpPaise(599900), 1020000)
const priced = preview7PricedPlan(COACHING_PLANS['3_months'], '/preview7')
assert.equal(priced.amountPaise, 340000)
assert.equal(priced.displayPrice, '₹3,400')
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '199900',
    list_amount_paise: '340000',
    discount_paise: '140100',
    discount_code: 'diwali7o',
  }),
  199900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['6_months'], {
    amount_paise: '349900',
    list_amount_paise: '595000',
    discount_paise: '245100',
    discount_code: 'WINTER7O',
  }),
  349900
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['12_months'], {
    amount_paise: '1020000',
    list_amount_paise: '1020000',
  }),
  1020000
)
assert.equal(
  expectedAmountPaiseFromOrderNotes(COACHING_PLANS['3_months'], {
    amount_paise: '100',
    list_amount_paise: '340000',
    discount_paise: '339900',
    discount_code: 'DIWALI7O',
  }),
  59900
)
const diwaliStart = preview7SaleAt(PREVIEW7_SALE_EPOCH_MS)
assert.equal(diwaliStart.name, 'Diwali sale')
assert.equal(diwaliStart.code, 'DIWALI7O')
assert.equal(diwaliStart.remainingMs, PREVIEW7_SALE_CYCLE_MS)
const winterStart = preview7SaleAt(PREVIEW7_SALE_EPOCH_MS + PREVIEW7_SALE_CYCLE_MS)
assert.equal(winterStart.name, 'Winter sale')
assert.equal(winterStart.code, 'WINTER7O')
assert.equal(winterStart.remainingMs, PREVIEW7_SALE_CYCLE_MS)
const back = preview7SaleAt(PREVIEW7_SALE_EPOCH_MS + PREVIEW7_SALE_CYCLE_MS * 2)
assert.equal(back.code, 'DIWALI7O')
const almostDone = preview7SaleAt(PREVIEW7_SALE_EPOCH_MS + PREVIEW7_SALE_CYCLE_MS - 1)
assert.equal(almostDone.code, 'DIWALI7O')
assert.equal(almostDone.remainingMs, 1)
const themed = applyPreview7Sale(
  `<fitness-gallery-abc class="hero">
<div class="price">₹1999</div>
<div>≈ ₹666/month</div>
<div class="price">₹3499</div>
<div>≈ ₹583/month</div>
<div>Save ₹1,495 vs monthly rate</div>
<div class="price">₹5999</div>
<div>≈ ₹500/month</div>
<div>Save ₹3,989 vs monthly rate</div>
<option value="Fat loss · 90 days · ₹1,999">Fat loss · 90 days · ₹1,999</option>
<script>
'3_months': { label: 'Fat loss', price: '₹1,999', per: '90 days', path: '3-months' },
root.querySelector('[data-lxq-checkout]').href = 'https://app.lurvox.in/plans/' + plan.path + '?landing=/preview7';
</script>
<a data-plan-link="https://app.lurvox.in/plans/3-months?landing=/preview7"></a>
</fitness-gallery-abc>
</body>`,
  'http://localhost:3000',
  PREVIEW7_SALE_EPOCH_MS
)
assert.match(themed, /Diwali sale/)
assert.match(themed, /ends in/)
assert.match(themed, /DIWALI7O/)
assert.match(themed, /extra 70% off/)
assert.match(themed, /₹3,400/)
assert.match(themed, /₹1,999 with code/)
assert.match(themed, /₹5,950/)
assert.match(themed, /₹10,200/)
assert.match(themed, /₹1,132\/month/)
assert.equal(themed.includes('₹1999</div>'), false)
assert.match(themed, /http:\/\/localhost:3000\/plans\/3-months\?landing=\/preview7&code=DIWALI7O/)
assert.match(themed, /window\.lxP7PlanHref\(plan\.path\)/)
assert.equal(themed.indexOf('id="lx-p7-sale"') < themed.indexOf('<fitness-gallery-abc'), true)
const normal = preview7StorefrontHtml('<head></head><body><style>body{background:#111}</style></body>', 'http://localhost:3000', PREVIEW7_SALE_EPOCH_MS)
assert.equal(normal.includes('preview7-beige'), false)
assert.match(normal, /<base href="https:\/\/www\.lurvox\.in\/">/)
const tracked = injectPreview7Tracking(normal, {
  pixelId: '1195395326212201',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-test',
})
assert.match(tracked, /fbq\('init', "1195395326212201"\)/)
assert.match(tracked, /fbq\('track', 'PageView'\)/)
assert.match(tracked, /Lurvox_view_landing/)
assert.match(tracked, /lurvox-offer-strip-home/)
assert.equal(tracked.includes('location.replace'), false)
assert.equal(tracked.indexOf('id="preview7-tracking"') < tracked.indexOf('<base '), true)
assert.match(normal, /#ff6200/)
pass('preview 7 sale raises stickers 70%, keeps today’s price behind DIWALI7O / WINTER7O, and swaps every 8 hours')

const lukeMigration = readFileSync(
  resolve('supabase/migrations/20260809180000_luke_affiliate_promo.sql'),
  'utf8'
)
assert.match(lukeMigration, /'LUKE'/)
assert.match(lukeMigration, /referral/)
pass('migration seeds LUKE affiliate promo')

console.log('\nAll promo code checks passed.')
