'use client'

import type { ReactNode } from 'react'
import { spacing } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'
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
      className={motionClass.emptyEnter}
      style={{
        textAlign: 'center',
        padding: `${spacing[7]}px ${spacing[5]}px`,
        color: 'var(--text-muted)',
      }}
    >
      {icon && (
        <div style={{ marginBottom: spacing[4], color: 'var(--text-secondary)', display: 'flex', justifyContent: 'center', opacity: 0.85 }}>
          {icon}
        </div>
      )}
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
      {description && <p style={{ margin: '0 0 24px', fontSize: 15, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}
