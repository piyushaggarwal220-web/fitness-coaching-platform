'use client'

import type { ReactNode } from 'react'
import CoachNavbar from '@/app/components/CoachNavbar'
import { coachPageStyles } from '@/lib/coach-page-styles'

type CoachShellProps = {
  children?: ReactNode
  loading?: boolean
  narrow?: boolean
}

export function CoachShell({ children, loading, narrow }: CoachShellProps) {
  const containerStyle = narrow ? coachPageStyles.containerNarrow : coachPageStyles.container

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={coachPageStyles.page}>
          <div style={containerStyle}>
            <div className="skeleton" style={{ height: 32, width: '50%', borderRadius: 12, marginBottom: 16 }} />
            <div className="skeleton" style={{ height: 100, borderRadius: 16, marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 100, borderRadius: 16 }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <CoachNavbar />
      <div style={coachPageStyles.page}>
        <div style={containerStyle} className="animate-fade-in">
          {children}
        </div>
      </div>
    </>
  )
}
