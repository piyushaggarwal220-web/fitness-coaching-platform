'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { CHECKOUT_TRANSFORMATIONS } from '@/lib/checkout-transformations'

export function CheckoutTransformationCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const total = CHECKOUT_TRANSFORMATIONS.length

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    const onScroll = () => {
      const slide = el.querySelector<HTMLElement>('[data-slide]')
      if (!slide) return
      const w = slide.offsetWidth + 10
      if (w <= 0) return
      const next = Math.round(el.scrollLeft / w)
      setIndex(Math.max(0, Math.min(total - 1, next)))
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [total])

  useEffect(() => {
    const el = trackRef.current
    if (!el || total < 2) return
    const id = window.setInterval(() => {
      const slide = el.querySelector<HTMLElement>('[data-slide]')
      if (!slide) return
      const w = slide.offsetWidth + 10
      const next = (index + 1) % total
      el.scrollTo({ left: next * w, behavior: 'smooth' })
    }, 4200)
    return () => window.clearInterval(id)
  }, [index, total])

  const go = (dir: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const slide = el.querySelector<HTMLElement>('[data-slide]')
    if (!slide) return
    const w = slide.offsetWidth + 10
    const next = Math.max(0, Math.min(total - 1, index + dir))
    el.scrollTo({ left: next * w, behavior: 'smooth' })
  }

  return (
    <section style={styles.wrap} aria-label="Client transformations">
      <div style={styles.head}>
        <p style={styles.eyebrow}>Real results</p>
        <h2 style={styles.title}>Client transformations</h2>
        <p style={styles.sub}>Swipe to see what coaching looks like when someone actually sticks with it.</p>
      </div>

      <div style={styles.stage}>
        <button type="button" style={{ ...styles.arrow, left: 6 }} onClick={() => go(-1)} aria-label="Previous">
          ‹
        </button>
        <div ref={trackRef} style={styles.track} data-checkout-transforms>
          {CHECKOUT_TRANSFORMATIONS.map((item) => (
            <article key={item.id} style={styles.slide} data-slide>
              <div style={styles.imageWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image}
                  alt={`${item.name} transformation`}
                  style={styles.image}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div style={styles.meta}>
                <p style={styles.resultTitle}>{item.title}</p>
                <p style={styles.quote}>“{item.quote}”</p>
                <p style={styles.client}>
                  {item.name} · {item.city}
                </p>
              </div>
            </article>
          ))}
        </div>
        <button type="button" style={{ ...styles.arrow, right: 6 }} onClick={() => go(1)} aria-label="Next">
          ›
        </button>
      </div>

      <div style={styles.dots} role="tablist" aria-label="Transformation slides">
        {CHECKOUT_TRANSFORMATIONS.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show transformation ${i + 1}`}
            style={{
              ...styles.dot,
              backgroundColor: i === index ? colors.accent : 'rgba(255,255,255,0.22)',
              width: i === index ? 18 : 7,
            }}
            onClick={() => {
              const el = trackRef.current
              const slide = el?.querySelector<HTMLElement>('[data-slide]')
              if (!el || !slide) return
              el.scrollTo({ left: i * (slide.offsetWidth + 10), behavior: 'smooth' })
            }}
          />
        ))}
      </div>

      <style>{`
        [data-checkout-transforms]::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    margin: '0 0 18px',
    padding: '14px 0 4px',
  },
  head: {
    marginBottom: 12,
    textAlign: 'left',
  },
  eyebrow: {
    margin: '0 0 4px',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: {
    margin: '0 0 4px',
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: colors.textPrimary,
  },
  sub: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.4,
    color: colors.textMuted,
  },
  stage: {
    position: 'relative',
  },
  track: {
    display: 'flex',
    gap: 10,
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    padding: '2px 2px 8px',
  },
  slide: {
    flex: '0 0 86%',
    maxWidth: 360,
    scrollSnapAlign: 'center',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  imageWrap: {
    aspectRatio: '4 / 5',
    backgroundColor: '#0c0c0e',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  meta: {
    padding: `${spacing[2]}px ${spacing[2] + 2}px ${spacing[3]}px`,
  },
  resultTitle: {
    margin: '0 0 6px',
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: colors.textPrimary,
  },
  quote: {
    margin: '0 0 8px',
    fontSize: 13,
    lineHeight: 1.45,
    color: colors.textSecondary,
  },
  client: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: colors.textMuted,
  },
  arrow: {
    position: 'absolute',
    top: '38%',
    zIndex: 2,
    width: 32,
    height: 32,
    borderRadius: 999,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: 'rgba(9,9,11,0.72)',
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    height: 7,
    borderRadius: 999,
    border: 0,
    padding: 0,
    cursor: 'pointer',
    transition: 'width 0.2s ease, background-color 0.2s ease',
  },
}
