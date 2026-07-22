'use client'

import { useState } from 'react'
import { GenerationStatus } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing } from '@/lib/coach-theme'
import type { PlanSectionKind } from '@/lib/ai/edit-plan-section'

type Props = {
  section: PlanSectionKind
  clientId: string
  currentText: string
  open: boolean
  onClose: () => void
  onApply: (revisedText: string) => void
}

export function PlanSectionAiEditModal({
  section,
  clientId,
  currentText,
  open,
  onClose,
  onApply,
}: Props) {
  const [clientRequest, setClientRequest] = useState('')
  const [coachNote, setCoachNote] = useState('')
  const [revisedText, setRevisedText] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusVariant, setStatusVariant] = useState<'loading' | 'success' | 'error'>('loading')
  const [generating, setGenerating] = useState(false)

  if (!open) return null

  const label = section === 'nutrition' ? 'diet' : 'workout'

  const resetAndClose = () => {
    setClientRequest('')
    setCoachNote('')
    setRevisedText(null)
    setStatus(null)
    setGenerating(false)
    onClose()
  }

  const generate = async () => {
    if (!clientRequest.trim()) {
      setStatusVariant('error')
      setStatus("Enter the client's request first.")
      return
    }

    setGenerating(true)
    setStatusVariant('loading')
    setStatus(`Updating ${label} with AI…`)
    setRevisedText(null)

    try {
      const res = await fetch('/api/coach/edit-plan-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          section,
          currentText,
          clientRequest: clientRequest.trim(),
          coachNote: coachNote.trim() || undefined,
        }),
      })
      const data = (await res.json()) as {
        revisedText?: string
        summary?: string
        error?: string
      }
      if (!res.ok || !data.revisedText) {
        throw new Error(data.error ?? 'AI edit failed')
      }
      setRevisedText(data.revisedText)
      setStatusVariant('success')
      setStatus(data.summary ?? 'Revision ready — review and apply.')
    } catch (err) {
      setStatusVariant('error')
      setStatus(err instanceof Error ? err.message : 'AI edit failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-edit-section-title"
      style={s.drawerOverlay}
      onClick={resetAndClose}
    >
      <div style={s.drawer} onClick={(e) => e.stopPropagation()}>
        <h2 id="ai-edit-section-title" style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>
          Edit {label} with AI
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          Paste the client&apos;s request (from chat or check-in). AI will revise only this section. Review the
          draft, apply it to the editor, then save / deliver so the tracker updates.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Client request *
        </label>
        <textarea
          value={clientRequest}
          onChange={(e) => setClientRequest(e.target.value)}
          rows={4}
          placeholder="e.g. Swap evening carbs for more protein, keep Monday meals the same…"
          disabled={generating}
          style={{
            ...s.noteInput,
            minHeight: 96,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          Extra coach guidance (optional)
        </label>
        <input
          type="text"
          value={coachNote}
          onChange={(e) => setCoachNote(e.target.value)}
          placeholder="e.g. Keep weekly calories near current target"
          disabled={generating}
          style={s.noteInput}
        />

        <GenerationStatus message={status} variant={statusVariant} />

        {revisedText != null && (
          <div style={{ marginBottom: spacing[3] }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>
              AI draft
            </div>
            <pre style={{ ...s.comparePre, maxHeight: 280 }}>{revisedText}</pre>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: spacing[2] }}>
          <Button
            variant="primary"
            disabled={generating}
            onClick={() => void generate()}
            style={{ flex: '1 1 160px' }}
          >
            {generating ? 'Generating…' : revisedText ? 'Regenerate' : 'Generate revision'}
          </Button>
          {revisedText != null && (
            <Button
              variant="secondary"
              disabled={generating}
              onClick={() => {
                onApply(revisedText)
                resetAndClose()
              }}
              style={{ flex: '1 1 160px' }}
            >
              Apply to editor
            </Button>
          )}
          <Button variant="ghost" disabled={generating} onClick={resetAndClose}>
            Cancel
          </Button>
        </div>

        <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted, lineHeight: 1.45 }}>
          Tip: after applying, click <strong>Save changes</strong>
          {section === 'nutrition' || section === 'workout' ? ' (or Deliver)' : ''} so the client’s daily
          tracker rebuilds from the new plan.
        </p>
      </div>
    </div>
  )
}

export function AiEditSectionButton({
  label = 'Edit with AI',
  onClick,
  disabled,
}: {
  label?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${colors.accentMuted}`,
        background: colors.accentMuted,
        color: colors.accent,
        borderRadius: radius.sm,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
