'use client'

import { useEffect, useState } from 'react'

/** Centralized motion durations (ms) */
export const duration = {
  fast: 120,
  normal: 180,
  medium: 250,
  slow: 350,
} as const

export const easing = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const

/** CSS class names — defined in globals.css */
export const motionClass = {
  pageEnter: 'motion-page-enter',
  cardEnter: 'motion-card-enter',
  cardInteractive: 'motion-card-interactive',
  messageEnter: 'motion-message-enter',
  emptyEnter: 'motion-empty-enter',
  dropdownEnter: 'motion-dropdown-enter',
  badgePop: 'motion-badge-pop',
  bellBounce: 'motion-bell-bounce',
  successGlow: 'motion-success-glow',
  shake: 'motion-shake',
  queueEnter: 'motion-queue-enter',
  photoZoom: 'motion-photo-zoom',
  bottomSheetOverlay: 'motion-bottom-sheet-overlay',
  bottomSheetPanel: 'motion-bottom-sheet-panel',
  recordingPulse: 'motion-recording-pulse',
  waveformPlaying: 'motion-waveform-playing',
  aiStepEnter: 'motion-ai-step-enter',
  inputBarEnter: 'motion-input-bar-enter',
  statusPulseOnce: 'motion-status-pulse-once',
} as const

export function staggerClass(index: number): string {
  return `motion-stagger-${Math.min(Math.max(index, 0), 8)}`
}

export function motionTransition(
  speed: keyof typeof duration = 'normal',
  properties = 'all',
): string {
  return `${properties} ${duration[speed]}ms ${easing.standard}`
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return reduced
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/** Subtle count-up for numeric displays */
export function useCountUp(target: number, speed: keyof typeof duration = 'slow'): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }

    const ms = duration[speed]
    const start = performance.now()
    let frame: number

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / ms)
      setValue(target * easeOutCubic(progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, reduced, speed])

  return value
}

export const AI_GENERATION_STEPS = [
  'Analyzing progress',
  'Reviewing check-ins',
  'Comparing previous plans',
  'Preparing updated recommendations',
  'Draft ready',
] as const
