import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { TERMS_POLICY_VERSION } from '@/lib/policies'

export const metadata = { title: brandTitle('Terms') }

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: colors.bgPrimary, color: colors.textPrimary, padding: `${spacing[6]}px ${spacing[3]}px` }}>
      <article style={{ maxWidth: 760, margin: '0 auto', background: colors.bgCard, border: `1px solid ${colors.borderSubtle}`, borderRadius: radius.lg, padding: spacing[6], lineHeight: 1.7 }}>
        <h1>Terms &amp; Conditions</h1>
        <p><strong>Version:</strong> {TERMS_POLICY_VERSION} · <strong>Effective:</strong> 21 July 2026</p>
        <p>
          These terms govern use of LURVOX coaching, messaging, plans, tracking tools, and related
          services. Please read them before purchasing or using the service.
        </p>

        <h2>1. Coaching is not medical care</h2>
        <p>
          LURVOX provides general fitness, nutrition, accountability, and lifestyle coaching. It
          does not provide medical diagnosis, treatment, physiotherapy, mental-health care,
          emergency services, or a substitute for advice from a qualified healthcare professional.
          Coaches cannot prescribe, stop, or change medication.
        </p>
        <p>
          Seek urgent local medical help immediately for an emergency. Obtain physician clearance
          before beginning or changing exercise or nutrition activity when appropriate, especially
          if you are pregnant or postpartum, take medication, have a pre-existing condition, recent
          surgery, pain, injury, dizziness, chest pain, breathing difficulty, or other health concern.
        </p>

        <h2>2. Your health information and safety</h2>
        <p>
          You must provide complete and accurate health, injury, medication, pregnancy, allergy,
          and dietary information and promptly report relevant changes. You remain responsible for
          deciding whether an activity is safe for you. Exercise carries risks, including injury
          and, rarely, serious medical events. Stop immediately if you experience pain, faintness,
          chest discomfort, unusual shortness of breath, or concerning symptoms and seek appropriate
          professional care.
        </p>
        <p>
          Nutrition guidance is general. You are responsible for checking ingredients, labels,
          portion suitability, food safety, allergies, intolerances, interactions, and dietary or
          religious restrictions. Consult a qualified clinician or dietitian where needed.
        </p>

        <h2>3. Outcomes and client participation</h2>
        <p>
          Results vary with health, starting point, adherence, sleep, stress, and other factors. No
          specific weight, physique, performance, health, or timing outcome is promised. You are
          responsible for your choices and participation.
        </p>

        <h2>4. Eligibility and minors</h2>
        <p>
          You must be at least 18 years old and legally able to enter this agreement. The current
          service is not offered to minors. Do not create an account for a minor or submit a
          minor&apos;s health information.
        </p>

        <h2>5. Acceptable use</h2>
        <p>
          Keep account credentials secure. Do not impersonate another person; harass or threaten
          anyone; upload unlawful, unsafe, infringing, or malicious material; scrape or reverse
          engineer the service; bypass access controls; disrupt the platform; or use coaching
          materials commercially without permission. We may restrict or suspend access where
          reasonably necessary for safety, security, legal compliance, or material breach.
        </p>

        <h2>6. Communications and electronic consent</h2>
        <p>
          You consent to receive service communications electronically through the app, email,
          telephone, or the contact details you provide, including account, payment, coaching, and
          safety messages. Availability and response times may vary. Chat response timers show a
          service target, not emergency coverage or an absolute guarantee. Keep your contact details
          current and contact emergency services—not chat—for urgent help.
        </p>

        <h2>7. Privacy and data handling</h2>
        <p>
          We process account, payment, coaching, health-intake, progress, messaging, and technical
          data to provide and protect the service. Refer to our applicable privacy notices and
          in-product disclosures for details. Do not send information you are not authorized to
          share. Payment processing is also subject to the payment provider&apos;s privacy terms.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          The platform, branding, software, and coaching materials are owned by LURVOX or its
          licensors. Subject to these terms, you receive a personal, limited, non-transferable,
          non-commercial right to use materials during your access period. You retain ownership of
          content you submit and permit us to host, process, and display it as needed to operate the
          service.
        </p>

        <h2>9. Payments, guarantee, refunds, and cancellation</h2>
        <p>
          Prices, plan duration, and payment details are shown at checkout. Payments are processed
          by Razorpay. The separate{' '}
          <Link href="/refund-policy" style={{ color: colors.accent }}>
            Refund &amp; Results Guarantee Policy
          </Link>{' '}
          forms part of these terms. Cancelling stops future service or renewal where applicable; it
          does not automatically create a refund for service already purchased or supplied.
        </p>
        <h3>Coaching results guarantee</h3>
        <p>
          A results-guarantee refund requires an administrator to review a documented client claim
          of no result and verify that at least 90% of all due check-ins were submitted within each
          check-in&apos;s 48-hour window. No-result status is never inferred automatically from
          measurements or other metrics. Exactly 90% qualifies; no due check-ins does not.
        </p>
        <p>Partial refunds remain subject to the same test and cannot exceed the remaining paid balance. Duplicate requests are deduplicated and audited.</p>

        <h2>10. Liability and indemnity</h2>
        <p>
          To the fullest extent permitted by law, LURVOX and its personnel are not liable for
          indirect, incidental, special, or consequential loss, or loss caused by inaccurate or
          withheld information, ignoring safety guidance, third-party services, or use outside the
          intended scope. Where liability may lawfully be limited, aggregate liability will not
          exceed the amount paid for the affected service.
        </p>
        <p>
          To the extent permitted by law, you agree to indemnify LURVOX against third-party claims
          caused by your unlawful use, infringement, or material breach. This does not require you
          to cover loss caused by our own unlawful conduct, negligence where liability cannot be
          excluded, or matters that law does not permit us to transfer.
        </p>

        <h2>11. Statutory rights</h2>
        <p>
          Nothing in these terms excludes, restricts, or modifies consumer guarantees, remedies,
          liability for fraud, personal injury caused by negligence, or any other right or liability
          that applicable law does not allow to be excluded. Statutory consumer remedies continue
          to apply.
        </p>

        <h2>12. Governing law, contact, and changes</h2>
        <p>
          These terms are governed by the laws applicable where LURVOX operates, subject to any
          mandatory consumer law and jurisdiction rights that apply to you. Contact us through the
          support or contact channel shown in the platform for questions, complaints, cancellation,
          or legal notices.
        </p>
        <p>
          We may update these terms for legal, safety, or service changes. The version and effective
          date appear above. Material changes will be communicated where required, and renewed
          agreement will be requested when appropriate. If part of these terms is unenforceable,
          the remaining terms continue to apply.
        </p>
        <Link href="/checkout" style={{ color: colors.accent }}>Return to checkout</Link>
      </article>
    </main>
  )
}
