'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { BRAND_ADMIN_LABEL } from '@/lib/brand'
import { adminStyles as s } from '@/lib/admin/styles'
import { useAdminGuard } from '@/lib/admin/use-admin-guard'

function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { loading, denied } = useAdminGuard()

  if (loading) {
    return (
      <div style={s.loading}>Loading {BRAND_ADMIN_LABEL}…</div>
    )
  }

  if (denied) {
    return (
      <div style={s.container}>
        <div style={s.error}>Admin access required. Redirecting to login…</div>
      </div>
    )
  }

  return <>{children}</>
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isPublicAdminRoute = pathname === '/admin/login'

  if (isPublicAdminRoute) {
    return children
  }

  return <AdminRouteGuard>{children}</AdminRouteGuard>
}
