'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { colors, radius, spacing } from '@/lib/design-tokens'
import type { ReactNode } from 'react'

type Props = {
  title: string
  children?: ReactNode
  loading?: boolean
  backHref?: string
}

export function ModuleShell({ title, children, loading, backHref = '/tracker' }: Props) {
  return (
    <ClientShell title={title} loading={loading}>
      <Link
        href={backHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: spacing[3],
          color: colors.textSecondary,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
          padding: '8px 12px',
          borderRadius: radius.sm,
          background: colors.bgElevated,
          border: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <ChevronLeft size={18} />
        Tracker
      </Link>
      {children}
    </ClientShell>
  )
}

export function ModuleEmpty({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: spacing[5],
        borderRadius: radius.lg,
        background: colors.bgElevated,
        border: `1px solid ${colors.borderSubtle}`,
        textAlign: 'center',
        color: colors.textSecondary,
        lineHeight: 1.6,
      }}
    >
      {message}
    </div>
  )
}
