'use client'

import { startTransition, useEffect, useState } from 'react'
import { PLAN_TRANSFORMATIONS, type PlanTransformation } from '@/lib/plan-transformations'
import styles from './AnimatedTransformations.module.css'

type Props = {
  /** Visual tone for Instant Plan dark page vs checkout. */
  variant?: 'instant' | 'checkout'
  heading?: string
  lede?: string
}

function TransformationCard({
  item,
  reduceMotion,
  delayMs,
}: {
  item: PlanTransformation
  reduceMotion: boolean
  delayMs: number
}) {
  const [showAfter, setShowAfter] = useState(reduceMotion)

  useEffect(() => {
    if (reduceMotion) {
      startTransition(() => setShowAfter(true))
      return
    }
    let intervalId = 0
    const startId = window.setTimeout(() => {
      startTransition(() => setShowAfter(true))
      intervalId = window.setInterval(() => {
        startTransition(() => setShowAfter((v) => !v))
      }, 2800)
    }, delayMs)
    return () => {
      window.clearTimeout(startId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [reduceMotion, delayMs])

  return (
    <article className={styles.card}>
      <div className={styles.frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.beforeSrc}
          alt={item.beforeAlt}
          className={`${styles.img} ${styles.imgBefore} ${showAfter ? styles.imgHidden : styles.imgVisible}`}
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.afterSrc}
          alt={item.afterAlt}
          className={`${styles.img} ${styles.imgAfter} ${showAfter ? styles.imgVisible : styles.imgHidden}`}
          loading="lazy"
          decoding="async"
        />
        <div className={styles.badgeRow} aria-hidden>
          <span className={`${styles.badge} ${showAfter ? styles.badgeMuted : ''}`}>Before</span>
          <span className={`${styles.badge} ${styles.badgeAfter} ${showAfter ? '' : styles.badgeMuted}`}>
            After
          </span>
        </div>
      </div>
      <h3 className={styles.cardTitle}>{item.title}</h3>
      <p className={styles.cardSub}>{item.subtitle}</p>
    </article>
  )
}

export function AnimatedTransformations({
  variant = 'instant',
  heading = 'Expected changes within 30 days',
  lede = 'Skinny to bulky. Fat to shredded. Weak to strong. Men and women.',
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => startTransition(() => setReduceMotion(mq.matches))
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  return (
    <section
      className={`${styles.wrap} ${variant === 'checkout' ? styles.wrapCheckout : ''}`}
      aria-label="Body transformations within 30 days"
    >
      <div className={styles.head}>
        <p className={styles.eyebrow}>Transformations</p>
        <h2 className={styles.title}>{heading}</h2>
        <p className={styles.lede}>{lede}</p>
      </div>
      <div className={styles.grid}>
        {PLAN_TRANSFORMATIONS.map((item, index) => (
          <TransformationCard
            key={item.id}
            item={item}
            reduceMotion={reduceMotion}
            delayMs={index * 350}
          />
        ))}
      </div>
    </section>
  )
}
