'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEMO_TOUR_STEPS, markDemoTourDone } from '@/lib/demo-tour'
import { colors, radius, spacing } from '@/lib/design-tokens'

type Hole = { top: number; left: number; width: number; height: number }

function measure(selector: string): Hole | null {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) return null
  const r = el.getBoundingClientRect()
  const pad = 8
  return {
    top: Math.max(8, r.top - pad),
    left: Math.max(8, r.left - pad),
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }
}

export function DemoTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState<Hole | null>(null)

  const step = DEMO_TOUR_STEPS[index]
  const last = index >= DEMO_TOUR_STEPS.length - 1

  const refresh = useCallback(() => {
    if (!step) return
    setHole(measure(step.selector))
  }, [step])

  useEffect(() => {
    if (!open) {
      setIndex(0)
      setHole(null)
      return
    }
    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [open, refresh])

  if (!open || !step) return null

  const finish = () => {
    markDemoTourDone()
    onClose()
  }

  const tooltipTop = hole ? Math.max(16, hole.top - 148) : 96

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-tour-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 240,
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={finish}
        style={{
          position: 'absolute',
          inset: 0,
          background: hole ? 'transparent' : 'rgba(0, 0, 0, 0.62)',
        }}
      />
      {hole ? (
        <div
          style={{
            position: 'absolute',
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: 14,
            boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.62), 0 0 0 2px ${colors.accent}`,
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          top: tooltipTop,
          left: 16,
          right: 16,
          maxWidth: 420,
          margin: '0 auto',
          padding: 16,
          borderRadius: radius.lg,
          background: colors.bgCard,
          border: `1px solid ${colors.borderSubtle}`,
          color: colors.textPrimary,
        }}
      >
        <p style={{ margin: 0, color: colors.accent, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em' }}>
          {index + 1} / {DEMO_TOUR_STEPS.length}
        </p>
        <h2 id="demo-tour-title" style={{ margin: '8px 0 6px', fontSize: 18 }}>
          {step.title}
        </h2>
        <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14, lineHeight: 1.5 }}>{step.body}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: spacing[4], justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={finish}
            style={{
              minHeight: 40,
              padding: '0 12px',
              border: 'none',
              background: 'transparent',
              color: colors.textMuted,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => {
              if (last) finish()
              else setIndex((n) => n + 1)
            }}
            style={{
              minHeight: 40,
              padding: '0 16px',
              border: 'none',
              borderRadius: 10,
              background: colors.accent,
              color: colors.textInverse,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
