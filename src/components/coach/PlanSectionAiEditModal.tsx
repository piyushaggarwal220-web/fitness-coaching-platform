'use client'

import { useEffect, useRef, useState } from 'react'
import { GenerationStatus } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import { Button } from '@/components/ui/Button'
import { colors, radius, spacing } from '@/lib/coach-theme'
import type { PlanSectionKind } from '@/lib/ai/edit-plan-section'

const POLL_INTERVAL_MS = 4000
const POLL_BUDGET_MS = 4 * 60 * 1000

type SectionEditStatus = {
  status?: string
  revisedText?: string
  summary?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

type Props = {
  section: PlanSectionKind
  clientId: string
  currentText: string
  open: boolean
  onClose: () => void
  onApply: (revisedText: string) => void
}

async function fetchSectionEditStatus(
  clientId: string,
  section: PlanSectionKind
): Promise<SectionEditStatus> {
  const poll = await fetch(
    `/api/coach/edit-plan-section/status?clientId=${encodeURIComponent(clientId)}&section=${section}`
  )
  return (await poll.json()) as SectionEditStatus
}

function isFreshResult(iso: string | undefined, queuedAt: number | null): boolean {
  if (!queuedAt) return true
  if (!iso) return false
  const at = Date.parse(iso)
  return Number.isFinite(at) && at >= queuedAt - 2000
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
  const [queueNonce, setQueueNonce] = useState(0)
  const queuedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const applyReady = (data: SectionEditStatus) => {
      setRevisedText(data.revisedText ?? null)
      setStatusVariant('success')
      setStatus(data.summary ?? 'Background draft ready — review and apply.')
      setGenerating(false)
      queuedAtRef.current = null
    }

    const applyFailed = (message: string) => {
      setStatusVariant('error')
      setStatus(message)
      setGenerating(false)
      queuedAtRef.current = null
    }

    const pollUntilSettled = async () => {
      const started = Date.now()
      while (!cancelled && Date.now() - started < POLL_BUDGET_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (cancelled) return
        let data: SectionEditStatus
        try {
          data = await fetchSectionEditStatus(clientId, section)
        } catch {
          continue
        }
        if (cancelled) return
        const queuedAt = queuedAtRef.current
        if (data.status === 'ready' && data.revisedText && isFreshResult(data.completedAt, queuedAt)) {
          applyReady(data)
          return
        }
        if (data.status === 'failed' && isFreshResult(data.completedAt, queuedAt)) {
          applyFailed(data.error ?? 'AI rewrite failed')
          return
        }
      }
      if (!cancelled) {
        setGenerating(false)
        setStatusVariant('success')
        setStatus(
          'Still generating in the background. Reopen this editor in a few minutes and the draft will be here.'
        )
      }
    }

    const boot = async () => {
      try {
        const data = await fetchSectionEditStatus(clientId, section)
        if (cancelled) return
        const queuedAt = queuedAtRef.current
        if (data.status === 'ready' && data.revisedText && isFreshResult(data.completedAt, queuedAt)) {
          applyReady(data)
          return
        }
        if (data.status === 'failed' && isFreshResult(data.completedAt, queuedAt)) {
          applyFailed(data.error ?? 'Previous AI rewrite failed')
          return
        }
        if (data.status === 'generating' || queuedAt) {
          setGenerating(true)
          setStatusVariant('loading')
          setStatus(
            data.status === 'generating'
              ? 'A rewrite is still running in the background. You can leave this page.'
              : `Regenerating ${section === 'nutrition' ? 'diet' : 'workout'} with AI in the background. You can leave this page.`
          )
          await pollUntilSettled()
        }
      } catch {
        // Reopen should still be usable if status cannot be loaded.
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [open, clientId, section, queueNonce])

  if (!open) return null

  const label = section === 'nutrition' ? 'diet' : section === 'cardio' ? 'cardio' : 'workout'
  const scratchInstruction =
    section === 'nutrition'
      ? 'Remake the diet plan completely from the client profile. Ignore the current draft text. Full 7-day plan with matching header and daily totals. No edit meta.'
      : section === 'cardio'
        ? 'Set the cardio plan to a single daily step count only. One line like 8000 steps. No LISS, HIIT, or extra notes.'
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
    if (!instruction && section !== 'nutrition' && section !== 'cardio' && !instructionOverride) {
      setStatusVariant('error')
      setStatus('Enter your coaching instruction first.')
      return
    }

    setGenerating(true)
    setStatusVariant('loading')
    setStatus(`Regenerating ${label} with AI in the background. You can leave this page.`)
    setRevisedText(null)
    queuedAtRef.current = Date.now()

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
          async: true,
        }),
      })
      const queued = (await res.json()) as { queued?: boolean; error?: string }
      if (!res.ok && res.status !== 202) {
        throw new Error(queued.error ?? 'AI rewrite failed')
      }

      setQueueNonce((n) => n + 1)
    } catch (err) {
      setGenerating(false)
      queuedAtRef.current = null
      setStatusVariant('error')
      const raw = err instanceof Error ? err.message : 'AI rewrite failed'
      const dropped =
        /load failed|failed to fetch|networkerror|network request failed|the operation was aborted/i.test(
          raw
        )
      setStatus(
        dropped
          ? 'The phone browser dropped the connection before the rewrite could start. Wait a moment and tap Regenerate again — generation only continues in the background after it has been queued.'
          : raw
      )
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
          {section === 'nutrition'
            ? 'Modify diet with AI'
            : section === 'cardio'
              ? 'Modify cardio with AI'
              : `Regenerate ${label} with AI`}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
          {section === 'nutrition'
            ? 'Updates the current diet — same meals and structure unless your notes or profile constraints require a change. Use Remake from scratch only if you want a brand-new week of meals.'
            : section === 'cardio'
              ? 'Cardio is only a daily step count (e.g. 8000 steps). Earlier coach requests stay in force unless you override them here.'
              : 'Updates the current workout — same days and lifts unless your notes require a change. Earlier coach requests stay in force unless you override them. Use Remake from scratch only for a brand-new week.'}{' '}
          Review the draft, apply it to the editor, then save or deliver.
        </p>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          {section === 'nutrition' || section === 'cardio' ? 'What to change (optional)' : 'Coach instruction *'}
        </label>
        <textarea
          value={coachInstruction}
          onChange={(e) => setCoachInstruction(e.target.value)}
          rows={5}
          placeholder={
            section === 'nutrition'
              ? 'e.g. Swap dinner chicken for paneer on Wed/Fri, or leave blank to fix preference/allergy issues only…'
              : section === 'cardio'
                ? 'e.g. Set daily steps to 10000…'
                : 'e.g. Swap Friday bench for dumbbell press, keep the rest of the week…'
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
            {generating
              ? 'Generating…'
              : revisedText
                ? 'Regenerate'
                : section === 'nutrition' || section === 'cardio'
                  ? 'Apply to current plan'
                  : 'Regenerate with coach instruction'}
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
          <Button variant="ghost" onClick={resetAndClose}>
            {generating ? 'Leave — keep generating' : 'Cancel'}
          </Button>
        </div>

        <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 12, color: colors.textMuted, lineHeight: 1.45 }}>
          Tip: after applying, click <strong>Save changes</strong>
          {section === 'nutrition' || section === 'workout' || section === 'cardio' ? ' (or Deliver)' : ''} so the client’s daily
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
