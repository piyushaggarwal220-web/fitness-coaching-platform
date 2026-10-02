'use client'

import { useState } from 'react'
import {
  appExperience,
  coaches,
  coaching,
  faq,
  finalCta,
  footer,
  goals,
  hero,
  nav,
  pillars,
  pricing,
  site,
  system,
} from '@/lib/content'
import { COACHING_PLANS, COACHING_PLAN_LIST } from '@/lib/payments/plans'
import { PLAN_PAGE_COPY } from '@/lib/payments/plan-pages'
import { CampaignImage, CtaLink, PrimaryCta } from './primitives'

export function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <a href="#top" className="lp-logo">
          LURVOX
        </a>
        <div className="lp-nav-actions">
          <CtaLink href="#pricing" variant="ghost" className="lp-nav-ghost">
            {nav.pricing}
          </CtaLink>
          <PrimaryCta className="lp-nav-cta">Start for {COACHING_PLANS['3_months'].displayPrice}</PrimaryCta>
        </div>
      </div>
    </header>
  )
}

export function Hero() {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-hero-media">
        <CampaignImage
          src="/images/lurvox/hero/hero-athletic-male.webp"
          alt="Athletic man in a dark studio, LURVOX campaign"
          priority
          className="lp-hero-img"
        />
        <div className="lp-hero-scrim" />
      </div>
      <div className="lp-container lp-hero-copy">
        <p className="lp-kicker">{hero.kicker}</p>
        <h1>{hero.headline}</h1>
        <p className="lp-lead">{hero.subheadline}</p>
        <p className="lp-price">
          <span>{hero.priceLabel}</span>
          <strong>{COACHING_PLANS['3_months'].displayPrice}</strong>
          <span>{hero.duration}</span>
        </p>
        <div className="lp-hero-actions">
          <PrimaryCta>Start for {COACHING_PLANS['3_months'].displayPrice}</PrimaryCta>
          <CtaLink href="#pricing" variant="ghost">
            {hero.secondaryCta}
          </CtaLink>
        </div>
      </div>
    </section>
  )
}

export function Goals() {
  return (
    <section className="lp-goals" id="goals" aria-labelledby="goals-title">
      <div className="lp-container lp-section-intro">
        <p className="lp-kicker">{goals.eyebrow}</p>
        <h2 id="goals-title">{goals.headline}</h2>
      </div>
      <div className="lp-goal-grid">
        {goals.items.map((goal) => {
          const plan = COACHING_PLAN_LIST.find((item) => item.slug === goal.plan)
          return (
            <article key={goal.id} className="lp-goal">
              <CampaignImage src={goal.image} alt={goal.alt} className="lp-goal-img" />
              <div className="lp-goal-copy">
                <p className="lp-kicker">{goal.timeframe}</p>
                <h3>{goal.title}</h3>
                <p>{goal.audience}</p>
                {plan && (
                  <p className="lp-goal-price">
                    {plan.displayPrice}
                    <span> · {plan.durationMonths} months</span>
                  </p>
                )}
                <PrimaryCta plan={goal.plan}>Start for {plan?.displayPrice ?? '₹599'}</PrimaryCta>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function System() {
  return (
    <section className="lp-system" id="system" aria-labelledby="system-title">
      <div className="lp-container lp-system-grid">
        <div>
          <p className="lp-kicker">{system.eyebrow}</p>
          <h2 id="system-title">{system.headline}</h2>
          <p className="lp-lead">{system.lead}</p>
        </div>
        <ol className="lp-system-list">
          {system.items.map((item, index) => (
            <li key={item.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Coaching() {
  return (
    <section className="lp-coaching" id="coaching" aria-labelledby="coaching-title">
      <div className="lp-container">
        <p className="lp-kicker">{coaching.eyebrow}</p>
        <h2 id="coaching-title">{coaching.headline}</h2>
        <p className="lp-lead">{coaching.lead}</p>
        <div className="lp-coach-grid">
          {coaches.map((coach) => (
            <a
              key={coach.instagramHandle}
              href={coach.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-coach"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- real coach photographs */}
              <img src={coach.photo} alt={`${coach.name}, LURVOX coach`} />
              <span>
                <strong>{coach.name}</strong>
                <em>{coach.instagramHandle}</em>
              </span>
            </a>
          ))}
        </div>
        <p className="lp-note">{coaching.note}</p>
      </div>
    </section>
  )
}

export function AppExperience() {
  return (
    <section className="lp-app" id="app" aria-labelledby="app-title">
      <div className="lp-container">
        <p className="lp-kicker">{appExperience.eyebrow}</p>
        <h2 id="app-title">{appExperience.headline}</h2>
        <p className="lp-lead">{appExperience.lead}</p>
        <ul className="lp-app-list">
          {appExperience.items.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function Pillars() {
  const blocks = [pillars.training, pillars.nutrition, pillars.recovery]
  return (
    <section className="lp-pillars" aria-label="Training, nutrition, and recovery">
      {blocks.map((block) => (
        <article key={block.eyebrow} className="lp-pillar">
          <CampaignImage src={block.image} alt={block.alt} className="lp-pillar-img" />
          <div className="lp-pillar-copy">
            <p className="lp-kicker">{block.eyebrow}</p>
            <h2>{block.headline}</h2>
            <p>{block.body}</p>
          </div>
        </article>
      ))}
    </section>
  )
}

export function Pricing() {
  return (
    <section className="lp-pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="lp-container">
        <p className="lp-kicker">{pricing.eyebrow}</p>
        <h2 id="pricing-title">{pricing.headline}</h2>
        <p className="lp-lead">{pricing.subheadline}</p>
        <div className="lp-plan-grid">
          {COACHING_PLAN_LIST.map((plan) => {
            const copy = PLAN_PAGE_COPY[plan.slug as keyof typeof PLAN_PAGE_COPY]
            const monthly = Math.round(plan.amountPaise / 100 / plan.durationMonths)
            return (
              <article
                key={plan.slug}
                className={plan.popular ? 'lp-plan lp-plan-popular' : 'lp-plan'}
              >
                <p className="lp-kicker">{copy?.durationLabel}</p>
                <h3>{plan.name}</h3>
                <p className="lp-plan-price">{plan.displayPrice}</p>
                <p className="lp-plan-month">≈ ₹{monthly}/month</p>
                <p className="lp-plan-blurb">{copy?.promise}</p>
                <PrimaryCta plan={plan.slug} className="lp-plan-cta">
                  Start for {plan.displayPrice}
                </PrimaryCta>
              </article>
            )
          })}
        </div>
        <ul className="lp-includes">
          {pricing.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function FaqSection() {
  const [open, setOpen] = useState(0)
  return (
    <section className="lp-faq" id="faq" aria-labelledby="faq-title">
      <div className="lp-container lp-faq-grid">
        <div>
          <p className="lp-kicker">{faq.eyebrow}</p>
          <h2 id="faq-title">{faq.headline}</h2>
        </div>
        <div>
          {faq.items.map((item, index) => {
            const isOpen = open === index
            return (
              <div key={item.q} className="lp-faq-item">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : index)}
                >
                  {item.q}
                  <span aria-hidden>{isOpen ? '–' : '+'}</span>
                </button>
                {isOpen && <p>{item.a}</p>}
              </div>
            )
          })}
          <p className="lp-note">
            Refund and cancellation rules:{' '}
            <a href="/terms#payments-refunds-guarantees">Terms</a>
          </p>
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="lp-final" aria-labelledby="final-title">
      <div className="lp-container">
        <h2 id="final-title">{finalCta.headline}</h2>
        <p className="lp-lead">{finalCta.subheadline}</p>
        <p className="lp-price">
          <span>Starting from</span>
          <strong>{COACHING_PLANS['3_months'].displayPrice}</strong>
        </p>
        <PrimaryCta>Start for {COACHING_PLANS['3_months'].displayPrice}</PrimaryCta>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <div>
          <strong>LURVOX</strong>
          <p>{footer.tagline}</p>
        </div>
        <div>
          <a href="/terms">Terms</a>
          <a href="/terms#payments-refunds-guarantees">Refunds</a>
          <a href={site.whatsappUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp {site.whatsappDisplay}
          </a>
        </div>
        <p>{footer.payments}</p>
        <p>{footer.legal}</p>
        <p>{footer.copyright}</p>
      </div>
    </footer>
  )
}
