'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isClientAppPath } from '@/lib/client-theme'

/**
 * Applies `html.client-portal` on every client-app route so CSS variables
 * (and shared inputs) use beige/dark-text instead of the admin dark palette.
 */
export function ClientPortalRoot() {
  const pathname = usePathname()

  useEffect(() => {
    const root = document.documentElement
    if (isClientAppPath(pathname)) {
      root.classList.add('client-portal')
    } else {
      root.classList.remove('client-portal')
    }
  }, [pathname])

  return null
}
