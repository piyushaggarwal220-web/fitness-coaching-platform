'use client'

import {
  affordability,
  faq,
  finalCta,
  footer,
  guarantee,
  hero,
  heroTransforms,
  howItWorks,
  insideCoaching,
  nav,
  pricing,
  site,
  socialProof,
  transformations,
  whatYouGet,
  whyPeopleFail,
} from '@/lib/content'
import {
  CtaLink,
  Floating,
  ImagePlaceholder,
  Reveal,
  SectionCta,
  TiltCard,
} from './primitives'

export function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <a href="#top" className="lp-logo">
          LURV<span>OX</span>
        </a>
        <div style={{ display: 'flex', gap: 10 }}>
          <CtaLink href="#pricing" variant="ghost" className="lp-nav-ghost">
            {nav.pricing}
          </CtaLink>
          <CtaLink href={`${site.checkoutBase}?plan=3_months`}>{nav.cta}</CtaLink>
        </div>
      </div>
    </header>
  )
}

export function Hero() {
  return (
    <section className="lp-section lp-hero" id="top">
      <div className="lp-container lp-hero-grid">
        <Reveal>
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">{site.brand}</p>
            <h1>{hero.headline}</h1>
            <p className="lp-sub">{hero.subheadline}</p>
            <div className="lp-hero-actions">
              <CtaLink href={`${site.checkoutBase}?plan=3_months`}>{hero.primaryCta}</CtaLink>
              <CtaLink href="#pricing" variant="ghost">
                {hero.secondaryCta}
              </CtaLink>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="lp-hero-photo-wrap">
            <Floating amplitude={6} duration={5.5}>
              <TiltCard intensity={6} className="lp-card" style={{ borderRadius: 24, overflow: 'hidden' }}>
                {/* Replace with coach photo — set hero.coachPhoto in content.ts */}
                <ImagePlaceholder
                  label={hero.coachPhotoAlt}
                  src={hero.coachPhoto || undefined}
                  className="lp-hero-photo"
                />
              </TiltCard>
            </Floating>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: '0.78rem',
                color: 'var(--lp-dim)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {hero.proofStripLabel}
            </p>
            <div className="lp-hero-transforms">
              {heroTransforms.map((item, i) => (
                <Floating key={item.name} amplitude={4 + i} duration={4.5 + i * 0.4}>
                  <div className="lp-hero-transform-card">
                    {/* Replace with transformation — set heroTransforms[].image */}
                    <ImagePlaceholder label={item.name} src={item.image || undefined} />
                    <div className="lp-hero-transform-meta">
                      <strong>{item.name}</strong>
                      <span>{item.result}</span>
                    </div>
                  </div>
                </Floating>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function SocialProof() {
  return (
    <section className="lp-section" id="results">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{socialProof.eyebrow}</p>
            <h2 className="lp-headline">{socialProof.headline}</h2>
            <p className="lp-sub">{socialProof.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-proof-scroll">
          {transformations.map((t, index) => (
            <Reveal key={t.id} delay={Math.min(index * 0.04, 0.24)}>
              <TiltCard className="lp-card lp-transform-card" intensity={5}>
                <div className="lp-transform-split">
                  <div style={{ position: 'relative' }}>
                    {/* Replace with client before photo — set transformations[].before */}
                    <ImagePlaceholder label={`${t.name} before`} src={t.before || undefined} />
                    <span className="lp-badge">Before</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    {/* Replace with client after photo — set transformations[].after */}
                    <ImagePlaceholder label={`${t.name} after`} src={t.after || undefined} />
                    <span className="lp-badge lp-badge-after">After</span>
                  </div>
                </div>
                <div className="lp-transform-body">
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>{t.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--lp-dim)' }}>{t.time}</div>
                  </div>
                  <div className="lp-transform-stats">
                    <span className="lp-chip">−{t.weightLost}</span>
                    <span className="lp-chip">BF −{t.bodyFatLost}</span>
                  </div>
                  {/* Replace with client testimonial */}
                  <p className="lp-quote">“{t.quote}”</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{socialProof.cta}</SectionCta>
      </div>
    </section>
  )
}

export function WhyPeopleFail() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{whyPeopleFail.eyebrow}</p>
            <h2 className="lp-headline">{whyPeopleFail.headline}</h2>
            <p className="lp-sub">{whyPeopleFail.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-fail-grid">
          {whyPeopleFail.cards.map((card, i) => (
            <Reveal key={card.title} delay={i * 0.06}>
              <TiltCard className="lp-card lp-fail-card" intensity={6}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{whyPeopleFail.cta}</SectionCta>
      </div>
    </section>
  )
}

export function HowItWorks() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{howItWorks.eyebrow}</p>
            <h2 className="lp-headline">{howItWorks.headline}</h2>
            <p className="lp-sub">{howItWorks.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-process">
          {howItWorks.steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.05}>
              <div className="lp-card lp-process-step">
                <span className="lp-process-num">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{howItWorks.cta}</SectionCta>
      </div>
    </section>
  )
}

export function InsideCoaching() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{insideCoaching.eyebrow}</p>
            <h2 className="lp-headline">{insideCoaching.headline}</h2>
            <p className="lp-sub">{insideCoaching.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-inside-grid">
          {insideCoaching.features.map((feature, i) => (
            <Reveal key={feature.title} delay={Math.min(i * 0.04, 0.2)}>
              <TiltCard className="lp-card lp-feature-card" intensity={5}>
                {/* Replace with dashboard — set insideCoaching.features[].image */}
                <ImagePlaceholder
                  label={`${feature.title} screen`}
                  src={feature.image || undefined}
                />
                <div className="lp-feature-body">
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{insideCoaching.cta}</SectionCta>
      </div>
    </section>
  )
}

export function WhatYouGet() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{whatYouGet.eyebrow}</p>
            <h2 className="lp-headline">{whatYouGet.headline}</h2>
            <p className="lp-sub">{whatYouGet.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-gets-grid">
          {whatYouGet.items.map((item, i) => (
            <Reveal key={item.title} delay={Math.min(i * 0.03, 0.2)}>
              <TiltCard className="lp-card lp-get-card" intensity={4}>
                <div className="lp-get-dot" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{whatYouGet.cta}</SectionCta>
      </div>
    </section>
  )
}

export function Pricing() {
  return (
    <section className="lp-section" id="pricing">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{pricing.eyebrow}</p>
            <h2 className="lp-headline">{pricing.headline}</h2>
            <p className="lp-sub">{pricing.subheadline}</p>
          </div>
        </Reveal>

        <div className="lp-pricing-grid">
          {pricing.plans.map((plan, i) => (
            <Reveal
              key={plan.slug}
              delay={i * 0.06}
              className={plan.popular ? 'lp-price-popular-wrap' : undefined}
            >
              <Floating amplitude={plan.popular ? 7 : 4} duration={5 + i * 0.3}>
                <TiltCard
                  className={`lp-card lp-price-card${plan.popular ? ' is-popular' : ''}`}
                  intensity={plan.popular ? 7 : 5}
                >
                  {plan.popular ? <span className="lp-popular-badge">MOST POPULAR</span> : null}
                  <h3 className="lp-price-name">{plan.name}</h3>
                  <div className="lp-price-amount">{plan.price}</div>
                  <div className="lp-price-month">{plan.perMonth}</div>
                  <p className="lp-price-blurb">{plan.blurb}</p>
                  {plan.save ? <span className="lp-save">{plan.save}</span> : <span style={{ height: 26 }} />}
                  <ul className="lp-price-features">
                    {pricing.featuresIncluded.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <CtaLink href={`${site.checkoutBase}?plan=${plan.slug}`} block>
                    {pricing.cta}
                  </CtaLink>
                </TiltCard>
              </Floating>
            </Reveal>
          ))}
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 20,
            color: 'var(--lp-dim)',
            fontSize: '0.85rem',
          }}
        >
          {pricing.comparisonNote}
        </p>
      </div>
    </section>
  )
}

export function Affordability() {
  return (
    <section className="lp-section" style={{ paddingTop: 0 }}>
      <div className="lp-container">
        <Reveal>
          <div className="lp-accent-card lp-afford">
            <h3>{affordability.headline}</h3>
            {affordability.body.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
            <p>{affordability.reassurance}</p>
          </div>
        </Reveal>
        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{pricing.cta}</SectionCta>
      </div>
    </section>
  )
}

export function Guarantee() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-accent-card lp-guarantee">
            <h2 className="lp-headline" style={{ marginBottom: 14 }}>
              {guarantee.headline}
            </h2>
            <p className="lp-sub">{guarantee.subheadline}</p>
            <p className="lp-guarantee-note">{guarantee.note}</p>
          </div>
        </Reveal>
        <SectionCta href={`${site.checkoutBase}?plan=3_months`}>{guarantee.cta}</SectionCta>
      </div>
    </section>
  )
}

export function FaqSection() {
  return (
    <section className="lp-section" id="faq">
      <div className="lp-container">
        <Reveal>
          <div className="lp-section-head">
            <p className="lp-eyebrow">{faq.eyebrow}</p>
            <h2 className="lp-headline">{faq.headline}</h2>
          </div>
        </Reveal>

        <div className="lp-faq-list">
          {faq.items.map((item, i) => (
            <Reveal key={item.q} delay={Math.min(i * 0.03, 0.18)}>
              <details className="lp-faq-item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>

        <SectionCta href={site.whatsappUrl}>{faq.cta}</SectionCta>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal>
          <div className="lp-final">
            {/* Replace with large client transformation — set hero.finalCtaImage */}
            <ImagePlaceholder
              label="Transformation hero"
              src={hero.finalCtaImage || undefined}
            />
            <div className="lp-final-copy">
              <h2>{finalCta.headline}</h2>
              <p className="lp-sub" style={{ maxWidth: 'none' }}>
                {finalCta.subheadline}
              </p>
              <CtaLink href={`${site.checkoutBase}?plan=3_months`}>{finalCta.cta}</CtaLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <a href="#top" className="lp-logo">
          LURV<span>OX</span>
        </a>
        <p>{footer.tagline}</p>
        <p>
          <a href={site.whatsappUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp — {site.whatsappDisplay}
          </a>
        </p>
        <p>{footer.payments}</p>
        <p>{footer.legal}</p>
        <p>{footer.copyright}</p>
      </div>
    </footer>
  )
}
