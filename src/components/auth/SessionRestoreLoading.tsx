'use client'

import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore'

type SessionRestoreLoadingProps = {
  message?: string
}

export function SessionRestoreLoading({
  message = SESSION_RESTORE_MESSAGE,
}: SessionRestoreLoadingProps) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: 15,
        padding: 24,
        textAlign: 'center',
      }}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  )
}
