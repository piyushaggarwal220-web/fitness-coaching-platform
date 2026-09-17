'use client'

import {
  COACH_PERSONALITY_IDS,
  COACH_PERSONALITY_MAX,
  COACH_PERSONALITY_META,
  COACH_PERSONALITY_MIN,
  type CoachPersonalityId,
} from '@/lib/coach-personality'
import { onboardingStyles as s } from '@/components/onboarding/styles'
import { colors, spacing } from '@/lib/design-tokens'

type Props = {
  values: string[]
  onChange: (values: string[]) => void
}

export function CoachPersonalitySelector({ values, onChange }: Props) {
  const selected = new Set(values)
  const atMax = values.length >= COACH_PERSONALITY_MAX

  const toggle = (id: CoachPersonalityId) => {
    if (selected.has(id)) {
      onChange(values.filter((v) => v !== id))
      return
    }
    if (atMax) return
    onChange([...values, id])
  }

  return (
    <div style={{ marginTop: spacing[5] }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
        How should your coach talk to you?
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 }}>
        Pick {COACH_PERSONALITY_MIN}–{COACH_PERSONALITY_MAX} styles. Your AI coach blends them.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {COACH_PERSONALITY_IDS.map((id) => {
          const meta = COACH_PERSONALITY_META[id]
          const active = selected.has(id)
          const blocked = !active && atMax
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              aria-pressed={active}
              disabled={blocked}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 14,
                border: active
                  ? '1px solid rgba(249,115,22,0.45)'
                  : `1px solid ${colors.borderSubtle}`,
                background: active
                  ? 'linear-gradient(145deg, rgba(249,115,22,0.14), rgba(24,24,27,0.98))'
                  : colors.bgCard,
                color: colors.textPrimary,
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.55 : 1,
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{meta.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>
                {meta.description}
              </p>
            </button>
          )
        })}
      </div>
      <p style={{ ...s.stepHint, marginTop: 10 }}>
        Selected {values.length} / {COACH_PERSONALITY_MAX}
      </p>
    </div>
  )
}
