import type { Metadata } from 'next'
import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import { COACHING_PLAN_LIST, TRIAL_PLAN } from '@/lib/payments/plans'
import { resolveMarketingBaseUrl } from '@/lib/admin/portal-urls'
import { colors, radius, spacing } from '@/lib/design-tokens'

export const metadata: Metadata = {
  title: brandTitle('7-Day All-Access Trial'),
  description:
    'Try LURVOX coaching for 7 days — coach chat, personal plan, trackers, and check-ins. ₹179 · once per person.',
}

const marketingBaseUrl = resolveMarketingBaseUrl()

const FEATURES = [
  'Personal coaching plan (diet + workout)',
  'Daily trackers and adherence',
  'Coach chat and weekly check-ins',
  'Full platform unlocked for 7 days',
]

export default function TrialPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: `radial-gradient(1200px 600px at 20% -10%, ${colors.accentMuted}, transparent), linear-gradient(180deg, ${colors.bgPrimary} 0%, ${colors.bgElevated} 100%)`,
        color: colors.textPrimary,
        padding: `${spacing[7]}px ${spacing[3]}px`,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link
          href={marketingBaseUrl}
          style={{ color: colors.textSecondary, textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to LURVOX
        </Link>

        <p
          style={{
            margin: '28px 0 8px',
            fontSize: 13,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.accent,
            fontWeight: 700,
          }}
        >
          Once per person
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: 36, lineHeight: 1.15, fontWeight: 800 }}>
          {brandTitle('7-day all-access trial')}
        </h1>
        <p style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: colors.accent }}>
          {TRIAL_PLAN.displayPrice}
          <span style={{ fontSize: 16, fontWeight: 600, color: colors.textSecondary }}> / week</span>
        </p>
        <p style={{ margin: '0 0 28px', fontSize: 16, lineHeight: 1.55, color: colors.textSecondary }}>
          Unlock the full coaching platform for 7 days — then upgrade to 3, 6, or 12 months when you&apos;re
          ready. Not available if you&apos;ve already used a trial or purchased before.
        </p>

        <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          {FEATURES.map((item) => (
            <li
              key={item}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: radius.md,
                background: colors.bgGlass,
                border: `1px solid ${colors.borderSubtle}`,
                fontSize: 15,
              }}
            >
              <span style={{ color: colors.accent, fontWeight: 800 }} aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <Link
          href={`/checkout?plan=${TRIAL_PLAN.slug}`}
          style={{
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            background: colors.accent,
            color: '#111',
            fontWeight: 800,
            fontSize: 17,
            padding: '16px 20px',
            borderRadius: radius.lg,
          }}
        >
          Start trial · {TRIAL_PLAN.displayPrice}
        </Link>

        <p style={{ margin: '18px 0 8px', fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
          Prefer a longer plan?
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {COACHING_PLAN_LIST.map((plan) => (
            <Link
              key={plan.slug}
              href={`/checkout?plan=${plan.slug}`}
              style={{
                textDecoration: 'none',
                color: colors.textPrimary,
                border: `1px solid ${colors.borderSubtle}`,
                borderRadius: radius.md,
                padding: '10px 12px',
                fontSize: 13,
                fontWeight: 600,
                background: colors.bgElevated,
              }}
            >
              {plan.name} · {plan.displayPrice}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
