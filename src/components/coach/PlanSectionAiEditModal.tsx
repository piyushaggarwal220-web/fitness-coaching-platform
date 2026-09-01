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
  const [coachInstruction, setCoachInstruction] = useState('')
  const [revisedText, setRevisedText] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [statusVariant, setStatusVariant] = useState<'loading' | 'success' | 'error'>('loading')
  const [generating, setGenerating] = useState(false)

  if (!open) return null

  const label = section === 'nutrition' ? 'diet' : 'workout'
  const scratchInstruction =
    section === 'nutrition'
      ? 'Remake the diet plan completely from the client profile. Ignore the current draft text. Full 7-day plan with matching header and daily totals. No edit meta.'
      : 'Remake the workout plan completely from the client profile. Ignore the current draft text. Full week with Day 1 (Monday) through Day 7. No edit meta.'

  const resetAndClose = () => {
    setCoachInstruction('')
    setRevisedText(null)
    setStatus(null)
    setGenerating(false)
    onClose()
  }

  const generate = async (instructionOverride?: string) => {
    const instruction = (instructionOverride ?? coachInstruction).trim()
    if (!instruction && section !== 'nutrition' && !instructionOverride) {
      setStatusVariant('error')
      setStatus('Enter your coaching instruction first.')
      return
    }

    setGenerating(true)
    setStatusVariant('loading')
    setStatus(`Regenerating ${label} with AI…`)
    setRevisedText(null)

    try {
      const res = await fetch('/api/coach/edit-plan-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          section,
          currentText,
          coachInstruction: instruction || undefined,
          remakeFromScratch: Boolean(instructionOverride),
        }),
      })
      const data = (await res.json()) as {
        revisedText?: string
        summary?: string
        error?: string
      }
      if (!res.ok || !data.revisedText) {
        throw new Error(data.error ?? 'AI rewrite failed')
      }
      setRevisedText(data.revisedText)
      setStatusVariant('success')
      setStatus(data.summary ?? 'Draft ready — review and apply.')
    } catch (err) {
      setStatusVariant('error')
      setStatus(err instanceof Error ? err.message : 'AI rewrite failed')
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
          {section === 'nutrition' ? 'Modify diet with AI' : `Regenerate ${label} with AI`}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          {section === 'nutrition'
            ? 'Updates the current diet — same meals and structure unless your notes or profile constraints require a change. Use Remake from scratch only if you want a brand-new week of meals.'
            : 'Tell the AI what you want in this section. It will write a fresh plan — not patch the old one — and won\'t mention edits in the client-facing text.'}{' '}
          Review the draft, apply it to the editor, then save or deliver.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          {section === 'nutrition' ? 'What to change (optional)' : 'Coach instruction *'}
        </label>
        <textarea
          value={coachInstruction}
          onChange={(e) => setCoachInstruction(e.target.value)}
          rows={5}
          placeholder={
            section === 'nutrition'
              ? 'e.g. Swap dinner chicken for paneer on Wed/Fri, or leave blank to fix preference/allergy issues only…'
              : 'e.g. Add a fourth day for shoulders, keep compound focus…'
          }
          disabled={generating}
          style={{
            ...s.noteInput,
            minHeight: 120,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
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
            {generating ? 'Generating…' : revisedText ? 'Regenerate' : section === 'nutrition' ? 'Apply to current diet' : 'Regenerate with coach instruction'}
          </Button>
          <Button
            variant="secondary"
            disabled={generating}
            onClick={() => void generate(scratchInstruction)}
            style={{ flex: '1 1 160px' }}
          >
            Remake from scratch
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
  label = 'Modify with AI',
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
