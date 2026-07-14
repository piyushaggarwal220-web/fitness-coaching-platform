'use client'

import {
  useRef,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import Link from 'next/link'

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function TiltCard({
  children,
  className,
  style,
  intensity = 8,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  intensity?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), {
    stiffness: 220,
    damping: 24,
  })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), {
    stiffness: 220,
    damping: 24,
  })

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  const onLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ ...style, rotateX, rotateY, transformPerspective: 900 }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
    </motion.div>
  )
}

export function Floating({
  children,
  className,
  amplitude = 8,
  duration = 5,
}: {
  children: ReactNode
  className?: string
  amplitude?: number
  duration?: number
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -amplitude, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

export function CtaLink({
  href,
  children,
  variant = 'primary',
  block = false,
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
  block?: boolean
  className?: string
}) {
  const classes = [
    'lp-btn',
    variant === 'primary' ? 'lp-btn-primary' : 'lp-btn-ghost',
    block ? 'lp-btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (href.startsWith('http') || href.startsWith('#')) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  )
}

export function SectionCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="lp-section-cta">
      <CtaLink href={href}>{children}</CtaLink>
    </div>
  )
}

export function ImagePlaceholder({
  label,
  src,
  className = '',
  style,
}: {
  label: string
  /** Public path e.g. `/landing/transforms/rahul-before.jpg` — leave empty for placeholder */
  src?: string
  className?: string
  style?: CSSProperties
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- landing assets from /public
      <img
        src={src}
        alt={label}
        className={`lp-img ${className}`.trim()}
        style={style}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <div className={`lp-ph ${className}`.trim()} style={style} role="img" aria-label={label}>
      <span>{label}</span>
    </div>
  )
}
