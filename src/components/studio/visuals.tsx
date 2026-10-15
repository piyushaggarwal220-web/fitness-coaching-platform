'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { CLIPS, planName, planPrice } from './content'
import type { CoachingPlanSlug } from '@/lib/payments/plans'

const ease = [0.16, 1, 0.3, 1] as const

const HEROES = [
  { src: '/images/lurvox/studio/hero.webp', alt: 'Athlete in motion in a white studio with orange light' },
  { src: '/images/lurvox/studio/hero-2.webp', alt: 'Athlete mid-stride in a white studio with orange light' },
  { src: '/images/lurvox/studio/hero-3.webp', alt: 'Athlete holding a lunge in a white studio with orange light' },
]

export function HeroFilm() {
  const reduce = useReducedMotion()
  const frameRef = useRef<HTMLElement>(null)
  const [ready, setReady] = useState<string[]>([HEROES[0].src])
  const [index, setIndex] = useState(0)
  const countRef = useRef(1)
  const { scrollYProgress } = useScroll({
    target: frameRef,
    offset: ['start end', 'end start'],
  })
  const scale = useTransform(scrollYProgress, [0, 1], [1.08, 0.92])
  const y = useTransform(scrollYProgress, [0, 1], [20, -36])

  useEffect(() => {
    let alive = true
    for (const shot of HEROES.slice(1)) {
      const probe = new window.Image()
      probe.onload = () => {
        if (!alive) return
        setReady((current) => (current.includes(shot.src) ? current : [...current, shot.src]))
      }
      probe.src = shot.src
    }
    return () => {
      alive = false
    }
  }, [])

  const shots = HEROES.filter((shot) => ready.includes(shot.src))
  countRef.current = shots.length

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const count = countRef.current
    if (reduce || count < 2) return
    const next = Math.min(count - 1, Math.floor(value * count))
    setIndex((current) => (current === next ? current : next))
  })

  const active = shots[index % shots.length] ?? shots[0]

  return (
    <figure className="st-hero-photo" ref={frameRef}>
      <motion.div className="st-hero-motion" style={reduce ? undefined : { scale, y }}>
        {shots.map((shot) => (
          <Image
            key={shot.src}
            src={shot.src}
            alt={shot.src === active.src ? shot.alt : ''}
            fill
            sizes="(min-width: 800px) 46vw, 100vw"
            priority={shot.src === HEROES[0].src}
            className={shot.src === active.src ? 'st-shot is-on' : 'st-shot'}
          />
        ))}
      </motion.div>
      {shots.length > 1 ? (
        <div className="st-hero-thumbs">
          {shots.map((shot, i) => (
            <button
              key={shot.src}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={shot.src === active.src}
              onClick={() => setIndex(i)}
            >
              <Image src={shot.src} alt="" width={72} height={54} />
            </button>
          ))}
        </div>
      ) : null}
    </figure>
  )
}

export function TrendChart() {
  const reduce = useReducedMotion()
  return (
    <figure className="st-chart-wrap">
      <svg viewBox="0 0 640 240" className="st-chart" role="img" aria-label="The plan rises, a check-in resets the week, then it is rewritten">
        <path d="M28 200 H612" stroke="rgba(13,13,13,0.12)" strokeWidth="1" />
        <motion.path
          d="M36 186 C 110 180, 140 150, 190 146 S 270 188, 330 118 S 450 52, 520 70 S 590 40, 608 34"
          fill="none"
          stroke="#FF5A1F"
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 1.3, ease }}
        />
        <circle cx="190" cy="146" r="5" fill="#fff" stroke="#FF5A1F" strokeWidth="2" />
        <circle cx="330" cy="118" r="5" fill="#fff" stroke="#FF5A1F" strokeWidth="2" />
        <circle cx="520" cy="70" r="5" fill="#fff" stroke="#FF5A1F" strokeWidth="2" />
      </svg>
      <figcaption>
        <span>Write</span>
        <span>Check-in</span>
        <span>Rewrite</span>
      </figcaption>
    </figure>
  )
}

const LENGTHS: CoachingPlanSlug[] = ['3_months', '6_months', '12_months']

export function DurationSlider({ onCommit }: { onCommit: (slug: CoachingPlanSlug) => void }) {
  const [index, setIndex] = useState(0)
  const pending = useRef(0)
  const slug = LENGTHS[index]

  function commit(next: number) {
    pending.current = next
    onCommit(LENGTHS[next])
  }

  return (
    <section className="st-slider" id="duration">
      <p className="st-kicker">Build your plan</p>
      <h2>Drag the length.</h2>
      <p className="st-slider-price">{planPrice(slug)}</p>
      <p className="st-slider-name">{planName(slug)} · {index === 0 ? '3 months' : index === 1 ? '6 months' : '12 months'}</p>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={index}
        aria-valuetext={`${planName(slug)}, ${planPrice(slug)}`}
        aria-label="Plan length"
        onChange={(event) => {
          const next = Number(event.target.value)
          pending.current = next
          setIndex(next)
        }}
        onPointerUp={() => commit(pending.current)}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
            commit(pending.current)
          }
        }}
      />
      <div className="st-slider-stops">
        <span>3 months</span>
        <span>6 months</span>
        <span>12 months</span>
      </div>
    </section>
  )
}

function ClipStill({ src, fallback }: { src: string; fallback: string }) {
  const [current, setCurrent] = useState(src)
  return (
    <Image
      src={current}
      alt=""
      fill
      sizes="240px"
      onError={() => {
        if (current !== fallback) setCurrent(fallback)
      }}
    />
  )
}

export function ClipRow() {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [wide, setWide] = useState(false)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const x = useTransform(scrollYProgress, [0.1, 0.9], ['6%', '-36%'])

  useEffect(() => {
    const query = window.matchMedia('(min-width: 800px)')
    const apply = () => setWide(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  return (
    <section className="st-clips" ref={ref} aria-label="Video library">
      <p className="st-kicker">Video library</p>
      <h2>The movement, then the clip in the app.</h2>
      <motion.div className="st-clip-row" style={wide && !reduce ? { x } : undefined}>
        {CLIPS.map((clip, i) => (
          <button
            key={clip.title}
            type="button"
            className={open === i ? 'is-open' : ''}
            aria-pressed={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <ClipStill src={clip.src} fallback={clip.fallback} />
            <span>{clip.title}</span>
          </button>
        ))}
      </motion.div>
    </section>
  )
}
