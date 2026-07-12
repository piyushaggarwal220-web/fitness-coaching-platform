'use client'

import type { ReactNode } from 'react'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { PageTransition } from '@/components/motion/PageTransition'

type AdminShellProps = {
  children: ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  return (
    <>
      <AdminNavbar />
      <PageTransition>{children}</PageTransition>
    </>
  )
}
