import Link from 'next/link'
import { brandTitle } from '@/lib/brand'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { TERMS_POLICY_VERSION } from '@/lib/policies'
import { TERMS_SECTIONS } from '@/lib/legal/terms-content'

export const metadata = { title: brandTitle('Terms & Conditions') }

export default function TermsPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: colors.bgPrimary,
        color: colors.textPrimary,
        padding: `${spacing[6]}px ${spacing[3]}px ${spacing[7]}px`,
      }}
    >
      <article
        style={{
          maxWidth: 760,
          margin: '0 auto',
          background: colors.bgCard,
          border: `1px solid ${colors.borderSubtle}`,
          borderRadius: radius.lg,
          padding: spacing[6],
          lineHeight: 1.7,
        }}
      >
        <Link href="/checkout" style={{ color: colors.accent }}>
          ← Back to checkout
        </Link>
        <h1 style={{ marginTop: spacing[4] }}>Terms &amp; Conditions</h1>
        <p>
          <strong>Version:</strong> {TERMS_POLICY_VERSION} · <strong>Effective:</strong> 13 August 2026
        </p>
        <p style={{ color: colors.textSecondary }}>
          This page is the only place LURVOX states refund, money-back, guarantee, upgrade, and
          service rules. Outside pages (ads, cards, landing copy) do not create those rights.
        </p>

        <nav
          aria-label="Terms sections"
          style={{
            margin: `${spacing[5]}px 0`,
            padding: spacing[4],
            borderRadius: radius.md,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgElevated,
            fontSize: 14,
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Contents</p>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {TERMS_SECTIONS.map((section) => (
              <li key={section.title} style={{ marginBottom: 4 }}>
                <a
                  href={`#${section.id ?? slugify(section.title)}`}
                  style={{ color: colors.accent }}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {TERMS_SECTIONS.map((section) => (
          <section
            key={section.title}
            id={section.id ?? slugify(section.title)}
            style={{ marginTop: spacing[6] }}
          >
            <h2 style={{ fontSize: 20, lineHeight: 1.3 }}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 64)}>{paragraph}</p>
            ))}
          </section>
        ))}

        <p style={{ marginTop: spacing[7], color: colors.textMuted, fontSize: 13 }}>
          End of Terms. If you did not read every section, you still agreed by purchasing or using
          the Service.
        </p>
        <Link href="/checkout" style={{ color: colors.accent }}>
          Return to checkout
        </Link>
      </article>
    </main>
  )
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
