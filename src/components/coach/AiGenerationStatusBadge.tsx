'use client'

import { colors } from '@/lib/coach-theme'
import type { AiGenerationStatusInfo } from '@/lib/ai/draft-status'
import { motionClass } from '@/lib/motion'

const TONE_STYLES: Record<AiGenerationStatusInfo['tone'], { bg: string; color: string }> = {
  success: { bg: colors.successMuted, color: colors.success },
  warning: { bg: colors.warningMuted, color: colors.warning },
  danger: { bg: colors.dangerMuted, color: colors.danger },
  muted: { bg: colors.bgElevated, color: colors.textMuted },
  accent: { bg: colors.accentMuted, color: colors.accent },
}

export function AiGenerationStatusBadge({
  info,
  compact,
}: {
  info: AiGenerationStatusInfo
  compact?: boolean
}) {
  const tone = TONE_STYLES[info.tone]
  const pulseOnce = info.status === 'ai_draft_ready'

  return (
    <div
      className={pulseOnce ? motionClass.statusPulseOnce : undefined}
      style={{
      display: 'inline-flex',
      flexDirection: compact ? 'row' : 'column',
      gap: compact ? 8 : 4,
      alignItems: compact ? 'center' : 'flex-start',
      padding: compact ? '6px 12px' : '10px 14px',
      borderRadius: 12,
      backgroundColor: tone.bg,
      border: `1px solid ${colors.borderSubtle}`,
    }}>
      <span style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: tone.color }}>
        {info.label}
      </span>
      {!compact && (
        <span style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.4 }}>
          {info.description}
        </span>
      )}
    </div>
  )
}
