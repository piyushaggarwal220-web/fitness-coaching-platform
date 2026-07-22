'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { motionClass, useReducedMotion } from '@/lib/motion'

type PageTransitionProps = {
  children: ReactNode
  className?: string
}

/** Fade + slight upward slide on route change (skipped when reduced motion is preferred). */
export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname()
  const reducedMotion = useReducedMotion()

  return (
    <div
      key={pathname}
      className={`${reducedMotion ? '' : motionClass.pageEnter} ${className ?? ''}`.trim()}
    >
      {children}
    </div>
  )
}
