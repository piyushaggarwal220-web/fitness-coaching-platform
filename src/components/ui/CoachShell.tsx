'use client'

import type { ReactNode } from 'react'
import { PageTransition } from '@/components/motion/PageTransition'
import CoachNavbar from '@/app/components/CoachNavbar'
import { coachPageStyles } from '@/lib/coach-page-styles'

type CoachShellProps = {
  children?: ReactNode
  loading?: boolean
  loadingMessage?: string
  narrow?: boolean
}

export function CoachShell({ children, loading, loadingMessage, narrow }: CoachShellProps) {
  const containerStyle = narrow ? coachPageStyles.containerNarrow : coachPageStyles.container

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={coachPageStyles.page}>
          <div style={containerStyle}>
            {loadingMessage ? (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, textAlign: 'center', paddingTop: 48 }}>
                {loadingMessage}
              </p>
            ) : (
              <>
                <div className="skeleton" style={{ height: 32, width: '50%', borderRadius: 12, marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 100, borderRadius: 16, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 100, borderRadius: 16 }} />
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <CoachNavbar />
      <div style={coachPageStyles.page}>
        <PageTransition>
          <div style={containerStyle}>
            {children}
          </div>
        </PageTransition>
      </div>
    </>
  )
}
