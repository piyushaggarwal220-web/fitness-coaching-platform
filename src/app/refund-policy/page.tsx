import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { REFUND_POLICY_VERSION } from '@/lib/policies'

export const metadata = {
  title: brandTitle('Refund & Results Guarantee Policy'),
}

export default function RefundPolicyPage() {
  return (
    <main style={{ minHeight: '100vh', background: colors.bgPrimary, color: colors.textPrimary, padding: `${spacing[6]}px ${spacing[3]}px` }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: colors.bgCard, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.lg, padding: spacing[6], lineHeight: 1.7 }}>
        <Link href="/checkout" style={{ color: colors.accent }}>← Back to checkout</Link>
        <h1>Refund & Results Guarantee Policy</h1>
        <p><strong>Version:</strong> {REFUND_POLICY_VERSION} · <strong>Effective:</strong> 21 July 2026</p>
        <p>
          Our coaching results guarantee applies only when both requirements below are verified.
          It is separate from any refund or remedy required by applicable law.
        </p>

        <h2>Eligibility requirements</h2>
        <ol>
          <li>
            The client reports that they achieved no result. We do not infer this from weight,
            photos, measurements, or other metrics. An authorized administrator must review and
            document the client&apos;s claim and supporting evidence.
          </li>
          <li>
            The client submitted at least 90% of all check-ins that were due, within each
            check-in&apos;s 48-hour submission window. Exactly 90% qualifies.
          </li>
        </ol>
        <p>
          The submission window begins at the recorded due timestamp and ends immediately before
          the timestamp 48 hours later. A submission at or after the 48-hour deadline is late.
          We use stored due and submission timestamps and the anchored coaching schedule.
        </p>

        <h2>Important edge cases</h2>
        <ul>
          <li>No due check-ins yet: the results guarantee cannot yet be assessed and is not eligible.</li>
          <li>An open 48-hour window: the request remains pending until the window closes or the check-in is submitted.</li>
          <li>Excused or waived check-ins: the platform does not currently support waivers, so every scheduled due check-in is counted.</li>
          <li>Partial refunds: the same eligibility test and documented review apply; total refunds cannot exceed the unrefunded payment balance.</li>
          <li>Duplicate requests: repeated submissions do not create additional entitlement and are deduplicated/audited by operation ID.</li>
        </ul>

        <h2>Consumer rights</h2>
        <p>
          This coaching results guarantee does not limit rights that cannot legally be excluded.
          Nothing here creates a blanket no-refund rule or removes statutory remedies for
          defective services, misrepresentation, unauthorized payments, or other protected claims.
        </p>

        <h2>Cancellation</h2>
        <p>
          You may request cancellation through the support channel in the platform. Cancellation
          ends future service or renewal where applicable but does not itself guarantee a refund.
          We assess any refund under this policy and any mandatory rights that apply.
        </p>
      </article>
    </main>
  )
}
