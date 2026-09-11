'use client'

import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { DemoTour } from '@/components/demo/DemoTour'
import { consumeDemoTourOffer, readDemoTourDone } from '@/lib/demo-tour'
import { PUBLIC_DEMO_READ_ONLY_MESSAGE, PUBLIC_DEMO_START_PLAN_PATH } from '@/lib/public-demo'
import { usePublicDemo } from '@/hooks/usePublicDemo'
import { COACHING_PLAN_LIST, type CoachingPlanSlug } from '@/lib/payments/plans'
import { planDurationLabel, planPathForSlug } from '@/lib/payments/plan-pages'
import { layout } from '@/lib/design-tokens'

type Props = {
  compact?: boolean
}

const TOUR_BAR_MIN_H = 56

const actionBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 48,
  padding: '12px 16px',
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 15,
  lineHeight: 1.2,
  cursor: 'pointer',
  textAlign: 'center',
  textDecoration: 'none',
  flexShrink: 0,
}

export function PublicDemoBanner({ compact = false }: Props) {
  const isDemo = usePublicDemo()
  const [tourOpen, setTourOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [tourTop, setTourTop] = useState<number>(layout.topBarHeight)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isDemo) return
    const offered = consumeDemoTourOffer()
    if (offered && !readDemoTourDone()) setShowHint(true)
  }, [isDemo])

  useLayoutEffect(() => {
    if (!mounted || !isDemo) return
    const root = document.documentElement
    root.classList.add('has-demo-tour-bar')
    root.classList.remove('has-checkin-due-banner')
    root.style.setProperty('--lx-checkin-banner-h', '0px')
    root.style.setProperty('--lx-checkin-banner-gap', '0px')

    const sync = () => {
      const header = document.querySelector('header.client-chrome')
      const headerBottom = header?.getBoundingClientRect().bottom ?? layout.topBarHeight
      setTourTop(Math.ceil(headerBottom))
      const bar = document.getElementById('lx-demo-tour-cta')
      const barH = bar ? Math.max(TOUR_BAR_MIN_H, Math.ceil(bar.getBoundingClientRect().height)) : TOUR_BAR_MIN_H
      root.style.setProperty('--lx-demo-tour-bar-h', `${barH}px`)
    }
    sync()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync)
    const header = document.querySelector('header.client-chrome')
    const bar = document.getElementById('lx-demo-tour-cta')
    if (header) observer?.observe(header)
    if (bar) observer?.observe(bar)
    window.addEventListener('resize', sync)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', sync)
      root.classList.remove('has-demo-tour-bar')
      root.style.removeProperty('--lx-demo-tour-bar-h')
    }
  }, [mounted, isDemo, showHint])

  if (!isDemo) return null

  const tourBar = mounted
    ? createPortal(
        <div
          id="lx-demo-tour-cta"
          style={{
            position: 'fixed',
            top: tourTop,
            left: 0,
            right: 0,
            zIndex: 200,
            width: '100%',
            maxWidth: layout.maxWidthWide,
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: '8px 12px',
            boxSizing: 'border-box',
            background: 'rgba(9, 9, 11, 0.96)',
            borderBottom: '1px solid rgba(255, 98, 0, 0.35)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {showHint ? (
            <p style={{ margin: '0 0 8px', color: '#fff', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
              Take a 30-second tour of where everything lives.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            style={{
              ...actionBtn,
              border: 'none',
              background: '#ff6200',
              color: '#09090b',
              whiteSpace: 'nowrap',
            }}
          >
            Take a short tour
          </button>
        </div>,
        document.body
      )
    : null

  return (
    <>
      {tourBar}
      <div
        className="lx-public-demo-banner"
        role="status"
        style={{
          margin: '0 0 16px',
          padding: '14px 14px 16px',
          borderRadius: 12,
          background: 'rgba(255, 98, 0, 0.12)',
          border: '1px solid rgba(255, 98, 0, 0.35)',
          color: '#ffb07a',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.45,
          overflow: 'visible',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <p style={{ margin: 0 }}>{PUBLIC_DEMO_READ_ONLY_MESSAGE}</p>
        <p style={{ margin: '10px 0 0', color: '#fff', fontWeight: 700 }}>
          Like what you see? Start your own plan.
        </p>

        {compact ? (
          <Link
            href={PUBLIC_DEMO_START_PLAN_PATH}
            style={{
              ...actionBtn,
              marginTop: 12,
              border: 'none',
              background: '#ff6200',
              color: '#09090b',
            }}
          >
            Get your own plan
          </Link>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {COACHING_PLAN_LIST.map((plan) => {
              const href = `/plans/${planPathForSlug(plan.slug as CoachingPlanSlug)}`
              const popular = Boolean(plan.popular)
              return (
                <Link
                  key={plan.slug}
                  href={href}
                  style={{
                    ...actionBtn,
                    border: popular ? 'none' : '1px solid rgba(255, 98, 0, 0.45)',
                    background: popular ? '#ff6200' : 'rgba(255, 98, 0, 0.16)',
                    color: popular ? '#09090b' : '#fff',
                    flexDirection: 'column',
                    gap: 2,
                    minHeight: 52,
                  }}
                >
                  <span>
                    {plan.name} · {planDurationLabel(plan.slug)} · {plan.displayPrice}
                  </span>
                  {popular ? (
                    <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>Most popular</span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        )}
      </div>
      <DemoTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false)
          setShowHint(false)
        }}
      />
    </>
  )
}
