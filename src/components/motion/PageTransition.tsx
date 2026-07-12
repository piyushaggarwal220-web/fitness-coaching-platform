'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { motionClass } from '@/lib/motion'

type PageTransitionProps = {
  children: ReactNode
  className?: string
}

/** Fade + slight upward slide on route change */
export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname()

  return (
    <div key={pathname} className={`${motionClass.pageEnter} ${className ?? ''}`.trim()}>
      {children}
    </div>
  )
}
