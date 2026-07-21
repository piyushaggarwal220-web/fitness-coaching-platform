import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import { colors, radius, spacing } from '@/lib/design-tokens'

export const metadata = { title: brandTitle('Terms') }

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: colors.bgPrimary, color: colors.textPrimary, padding: `${spacing[6]}px ${spacing[3]}px` }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: colors.bgCard, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.lg, padding: spacing[6], lineHeight: 1.7 }}>
        <h1>Terms</h1>
        <h2>Coaching results guarantee</h2>
        <p>
          A results-guarantee refund requires an administrator to review a documented client claim
          of no result and verify that at least 90% of all due check-ins were submitted within each
          check-in&apos;s 48-hour window. No-result status is never inferred automatically from
          measurements or other metrics. Exactly 90% qualifies; no due check-ins does not.
        </p>
        <p>
          Partial refunds remain subject to the same test and cannot exceed the remaining paid
          balance. Duplicate requests are deduplicated and audited. Full definitions and timing
          rules are in the <Link href="/refund-policy" style={{ color: colors.accent }}>Refund & Results Guarantee Policy</Link>.
        </p>
        <p>
          This coaching results guarantee does not limit rights that cannot legally be excluded.
          Statutory consumer remedies continue to apply.
        </p>
        <Link href="/checkout" style={{ color: colors.accent }}>Return to checkout</Link>
      </article>
    </main>
  )
}
