'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ClientShell } from '@/components/ui/ClientShell'
import { TrackerRefreshControls } from '@/components/tracker/TrackerRefreshControls'
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[2],
          marginBottom: spacing[3],
        }}
      >
        <Link
          href={backHref}
          className="card-hover"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: colors.textSecondary,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            padding: '8px 14px 8px 10px',
            borderRadius: radius.full,
            background: colors.bgGlass,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <ChevronLeft size={18} />
          Tracker
        </Link>
        {!loading && <TrackerRefreshControls />}
      </div>
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
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(24,24,27,0.92) 60%)',
        border: `1px solid ${colors.borderSubtle}`,
        backdropFilter: 'blur(16px)',
        textAlign: 'center',
        color: colors.textSecondary,
        lineHeight: 1.6,
      }}
    >
      <p style={{ margin: 0 }}>{message}</p>
      <p style={{ margin: '12px 0 0', fontSize: 13, color: colors.textMuted }}>
        If this looks wrong, open your plan or tap Refresh on the tracker.
      </p>
      <div
        style={{
          marginTop: spacing[3],
          display: 'flex',
          justifyContent: 'center',
          gap: spacing[2],
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/plan"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            borderRadius: radius.full,
            background: colors.accent,
            color: colors.textInverse,
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Open plan
        </Link>
        <Link
          href="/tracker"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            borderRadius: radius.full,
            background: colors.bgElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.borderSubtle}`,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to tracker
        </Link>
        <Link
          href="/client/report-issue?about=tracker"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            borderRadius: radius.full,
            background: colors.bgElevated,
            color: colors.textPrimary,
            border: `1px solid ${colors.borderSubtle}`,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Send feedback
        </Link>
      </div>
    </div>
  )
}
