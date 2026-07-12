'use client'

import { Check } from 'lucide-react'
import { colors } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'

type SuccessStateProps = {
  message: string
  onDismiss?: () => void
}

/** Soft checkmark + orange glow — no confetti */
export function SuccessState({ message }: SuccessStateProps) {
  return (
    <div
      className={motionClass.successGlow}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 14,
        backgroundColor: colors.accentMuted,
        border: `1px solid rgba(249, 115, 22, 0.25)`,
        marginBottom: 16,
      }}
      role="status"
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: colors.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Check size={18} color={colors.textInverse} strokeWidth={3} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.4 }}>
        {message}
      </p>
    </div>
  )
}
