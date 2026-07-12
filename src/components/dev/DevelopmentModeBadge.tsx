'use client'

import type { CSSProperties } from 'react'
import { colors } from '@/lib/design-tokens'

type DevelopmentModeBadgeProps = {
  message?: string
  style?: CSSProperties
}

export function DevelopmentModeBadge({
  message = 'Check-in schedule restrictions disabled.',
  style,
}: DevelopmentModeBadgeProps) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 12,
        backgroundColor: colors.warningMuted,
        border: `1px solid rgba(234, 179, 8, 0.25)`,
        marginBottom: 16,
        ...style,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.warning }}>
        🛠 Development Mode
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 1.45 }}>
        {message}
      </div>
    </div>
  )
}
