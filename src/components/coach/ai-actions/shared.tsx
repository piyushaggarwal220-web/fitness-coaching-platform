'use client'

import type { AiReasoningDisplay } from '@/lib/coach/ai-actions'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AiGenerationProgress } from '@/components/motion/AiGenerationProgress'
import { SuccessState } from '@/components/motion/SuccessState'
import { openCoachChatWithClient } from '@/lib/coach-open-chat'
import { colors } from '@/lib/coach-theme'
import { motionClass } from '@/lib/motion'
import { aiActionStyles as s } from './styles'

export function AiReasoningPanel({ reasoning }: { reasoning: AiReasoningDisplay | null }) {
  const [open, setOpen] = useState(false)
  if (!reasoning) return null

  return (
    <div>
      <button type="button" style={s.reasoningToggle} onClick={() => setOpen((v) => !v)}>
        {open ? '▼' : '▸'} AI Reasoning
      </button>
      {open && (
        <div style={s.reasoningBody}>
          <div style={s.reasoningRow}>
            <div style={s.reasoningLabel}>Complexity</div>
            <div>{reasoning.complexityTier} (score {reasoning.complexityScore})</div>
          </div>
          <div style={s.reasoningRow}>
            <div style={s.reasoningLabel}>Model</div>
            <div>{reasoning.model}</div>
          </div>
          {reasoning.knowledgeReferences.length > 0 && (
            <div style={s.reasoningRow}>
              <div style={s.reasoningLabel}>Knowledge base</div>
              <div>{reasoning.knowledgeReferences.join(' · ')}</div>
            </div>
          )}
          <div style={s.reasoningRow}>
            <div style={s.reasoningLabel}>Summary</div>
            <div>{reasoning.summary}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export function OptionalCoachNote({
  value,
  onChange,
  mode = 'optional',
}: {
  value: string
  onChange: (v: string) => void
  /** Always-visible discussion notes for weekly / initial generate. */
  mode?: 'optional' | 'discussion'
}) {
  const [show, setShow] = useState(mode === 'discussion' || Boolean(value))

  if (mode === 'discussion') {
    return (
      <label style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>
          What you discussed with the client
        </span>
        <span style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.45 }}>
          Add agreements from the call or check-in (food swaps, injury limits, schedule changes, calorie
          hold, etc.). The AI must follow these when generating the draft.
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="e.g. Keep calories the same this week, swap paneer for tofu on Tue/Thu, no lunges — knee flare-up, train only 4 days"
          style={{ ...s.noteInput, minHeight: 96, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
        />
      </label>
    )
  }

  if (!show && !value) {
    return (
      <button type="button" style={s.noteToggle} onClick={() => setShow(true)}>
        + Add optional coaching note
      </button>
    )
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" style={s.noteToggle} onClick={() => setShow((v) => !v)}>
        {show ? 'Hide coaching note' : 'Show coaching note'}
      </button>
      {show && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="e.g. Emphasize home workouts, reduce leg volume"
          style={{ ...s.noteInput, minHeight: 72, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.45 }}
        />
      )}
    </div>
  )
}

export function GenerationStatus({
  message,
  variant = 'loading',
  elapsedSeconds,
  stepLabel,
}: {
  message: string | null
  variant?: 'loading' | 'success' | 'error'
  elapsedSeconds?: number | null
  stepLabel?: string | null
}) {
  if (!message && !stepLabel) return null

  if (variant === 'success') {
    return <SuccessState message={message ?? 'Done'} />
  }

  if (variant === 'loading') {
    const elapsed =
      elapsedSeconds != null && elapsedSeconds >= 0
        ? ` · ${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}`
        : ''
    return (
      <div style={s.status}>
        <AiGenerationProgress active />
        <div style={{ marginTop: 8, fontSize: 14, color: 'inherit' }}>
          {stepLabel ? <strong>{stepLabel}</strong> : null}
          {stepLabel && message ? ' — ' : null}
          {message}
          {elapsed}
        </div>
      </div>
    )
  }

  return <div className={motionClass.shake} style={s.statusError}>{message}</div>
}

export function ActionCard({
  title,
  description,
  onClick,
  disabled,
  primary,
}: {
  title: string
  description: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...s.actionCard,
        ...(primary ? s.actionCardPrimary : {}),
        ...(disabled ? s.actionCardDisabled : {}),
      }}
    >
      <p style={s.actionTitle}>{title}</p>
      <p style={s.actionDesc}>{description}</p>
    </button>
  )
}

/** When AI can't generate, let the coach tell the client directly. */
export function MessageClientButton({
  clientId,
  label = 'Message client',
}: {
  clientId: string
  label?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        disabled={busy || !clientId}
        onClick={() => {
          void (async () => {
            setBusy(true)
            setError('')
            const result = await openCoachChatWithClient(clientId)
            setBusy(false)
            if ('error' in result) {
              setError(result.error)
              return
            }
            router.push(result.href)
          })()
        }}
        style={{
          ...s.noteToggle,
          color: colors.accent,
          fontWeight: 700,
          textDecoration: 'none',
          border: `1px solid ${colors.accent}`,
          borderRadius: 999,
          padding: '8px 14px',
          marginBottom: 0,
        }}
      >
        {busy ? 'Opening chat…' : label}
      </button>
      {error ? (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.danger }}>{error}</p>
      ) : null}
    </div>
  )
}
