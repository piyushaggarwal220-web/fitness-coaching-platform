'use client'

import type { ReactNode } from 'react'

type SlideTransitionProps = {
  children: ReactNode
  sectionKey: string
  direction: 'forward' | 'back'
}

/** Horizontal slide for multi-step flows (check-in sections) */
export function SlideTransition({ children, sectionKey, direction }: SlideTransitionProps) {
  return (
    <div
      key={sectionKey}
      className={direction === 'forward' ? 'motion-slide-forward' : 'motion-slide-back'}
    >
      {children}
    </div>
  )
}
