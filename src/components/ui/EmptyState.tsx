'use client'

import type { ReactNode } from 'react'
import { colors, spacing } from '@/lib/design-tokens'
import { Button } from './Button'

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: `${spacing[7]}px ${spacing[5]}px`,
        color: colors.textMuted,
      }}
    >
      {icon && (
        <div style={{ marginBottom: spacing[4], color: colors.textSecondary, display: 'flex', justifyContent: 'center' }}>
          {icon}
        </div>
      )}
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>{title}</h3>
      {description && <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.5, color: colors.textSecondary }}>{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}
