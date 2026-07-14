'use client'

import type { CSSProperties, ReactNode } from 'react'
import { coachPageStyles } from '@/lib/coach-page-styles'
import { spacing } from '@/lib/design-tokens'

type Props = {
  title: string
  subtitle?: string
  action?: ReactNode
  style?: CSSProperties
}

/** Strong section heading used across coach home and related pages. */
export function CoachSectionHeader({ title, subtitle, action, style }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing[3],
        marginBottom: spacing[3],
        ...style,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2 style={coachPageStyles.sectionTitle}>{title}</h2>
        {subtitle && <p style={coachPageStyles.sectionSubtitle}>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
