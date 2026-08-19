'use client'

import { useCallback, useEffect, useState } from 'react'
import { resolveAiGenerationStatus } from '@/lib/ai/draft-status'
import { createClient } from '@/lib/supabase/client'
import { planToForm } from '@/lib/plans'
import { savePlanDraftToSession } from '@/lib/ai/plan-format'
import { syncTrackerAfterPlanPublishAsync } from '@/lib/daily-tracker/client-sync'
import { planMatchesCheckin } from '@/lib/plan-metadata'
import { sendClientNotification } from '@/lib/notifications/client'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/coach-theme'
import { AiGenerationStatusBadge } from '@/components/coach/AiGenerationStatusBadge'
import { GenerationStatus, MessageClientButton, OptionalCoachNote } from './shared'
import { PlanCompareDrawer } from './PlanCompareDrawer'
import { aiActionStyles as s } from './styles'
import type { Plan } from '@/types/database'

const supabase = createClient()

type WeeklyCoachingPanelProps = {
  clientId: string
  checkinId: string
  coachId: string
  coachingWeek?: number | null
  checkinSubmittedAt?: string | null
}

async function findDraftForCheckin(clientId: string, checkinId: string): Promise<Plan | null> {
  const { data: drafts } = await supabase
    .from('plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('active', false)
    .like('title', 'AI Draft%')
    .order('updated_at', { ascending: false })
    .limit(20)

  const plans = (drafts ?? []) as Plan[]
  return plans.find((plan) => planMatchesCheckin(plan, checkinId)) ?? null
}

export function WeeklyCoachingPanel({
  clientId,
  checkinId,
  coachingWeek,
  checkinSubmittedAt,
}: WeeklyCoachingPanelProps) {
  const router = useRouter()
  const [coachNote, setCoachNote] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [statusVariant, setStatusVariant] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [draftPlan, setDraftPlan] = useState<Plan | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [failureMessage, setFailureMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [autoDraftScheduled, setAutoDraftScheduled] = useState<boolean | null>(null)
  const [planUpdateCadence, setPlanUpdateCadence] = useState<string | null>(null)
  const [nextAutoUpdateWeek, setNextAutoUpdateWeek] = useState<number | null>(null)

  const refreshDraftState = useCallback(async () => {
    const { data: active } = await supabase
      .from('plans')
      .select('*')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setActivePlan((active as Plan | null) ?? null)

    const draft = await findDraftForCheckin(clientId, checkinId)
    const waitingForDraft = isGenerating || busy || retrying
    setDraftPlan(draft)

    if (draft && waitingForDraft) {
      // Draft appeared while polling a queued job.
      setIsGenerating(false)
      setGenerationFailed(false)
      setBusy(false)
      setRetrying(false)
      setStatusVariant('success')
      setStatus('AI draft ready for review.')
      setShowCompare(true)
      setFailureMessage('')
      return
    }

    try {
      const res = await fetch(
        `/api/coach/ai-draft/status?clientId=${encodeURIComponent(clientId)}&checkinId=${encodeURIComponent(checkinId)}`
      )
      if (res.ok) {
        const data = (await res.json()) as {
          isGenerating?: boolean
          generationFailed?: boolean
          failureError?: string | null
          autoDraftScheduled?: boolean
          planUpdateCadence?: string
          nextAutoUpdateWeek?: number
        }
        setIsGenerating(Boolean(data.isGenerating) && !draft)
        setGenerationFailed(Boolean(data.generationFailed) && !draft)
        setFailureMessage(data.failureError?.trim() ?? '')
        if (typeof data.autoDraftScheduled === 'boolean') {
          setAutoDraftScheduled(data.autoDraftScheduled)
        }
        if (data.planUpdateCadence) setPlanUpdateCadence(data.planUpdateCadence)
        if (typeof data.nextAutoUpdateWeek === 'number') {
          setNextAutoUpdateWeek(data.nextAutoUpdateWeek)
        }
      }
    } catch {
      const submitted = checkinSubmittedAt ? new Date(checkinSubmittedAt).getTime() : 0
      const recent = submitted > 0 && Date.now() - submitted < 12 * 60 * 1000
      setIsGenerating(!draft && recent)
      setGenerationFailed(false)
    }
  }, [clientId, checkinId, checkinSubmittedAt, isGenerating, busy, retrying])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDraftState()
    }, 0)
    return () => window.clearTimeout(timer)
    // Intentionally only re-fetch when the check-in identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshDraftState closes over polling flags
  }, [clientId, checkinId])

  useEffect(() => {
    if (draftPlan || generationFailed || !isGenerating) return undefined
    const poll = setInterval(() => void refreshDraftState(), 5000)
    return () => clearInterval(poll)
  }, [draftPlan, generationFailed, isGenerating, refreshDraftState])

  const statusInfo = resolveAiGenerationStatus({
    draftPlan,
    activePlan,
    isGenerating: isGenerating || busy || retrying,
    generationFailed: generationFailed && !draftPlan,
  })

  const weekLabel = coachingWeek ? `Week ${coachingWeek}` : 'Weekly'

  const queueServerDraft = async (mode: 'manual' | 'retry' | 'regenerate') => {
    const isRetry = mode === 'retry'
    const trigger = mode === 'manual' ? 'manual' : 'retry'

    if (isRetry) setRetrying(true)
    else setBusy(true)

    setError('')
    setPublishSuccess(false)
    setStatusVariant('loading')
    setStatus(
      mode === 'regenerate'
        ? 'Regenerating AI draft from active plan and latest check-in…'
        : mode === 'retry'
          ? 'Retrying AI draft — reusing active plan, check-in, and prompt cache…'
          : 'Queuing AI draft from this check-in…'
    )
    setIsGenerating(true)
    setGenerationFailed(false)

    try {
      const res = await fetch('/api/coach/ai-draft/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          checkinId,
          coachingWeek,
          coachNote: coachNote.trim() || null,
          trigger,
          async: true,
        }),
      })
      const data = (await res.json()) as {
        success?: boolean
        error?: string
        queued?: boolean
        planId?: string
        generationTimeMs?: number
      }

      if (!res.ok || !data.success) {
        setStatusVariant('error')
        setStatus(null)
        const message = data.error ?? 'Draft generation failed. Please try again.'
        setError(message)
        setFailureMessage(message)
        setGenerationFailed(true)
        setIsGenerating(false)
        setBusy(false)
        setRetrying(false)
        return
      }

      if (data.queued || res.status === 202) {
        setStatusVariant('loading')
        setStatus('AI is building the draft. This page updates automatically…')
        // Keep polling via isGenerating; clear local busy flags so Retry isn't stuck.
        setBusy(false)
        setRetrying(false)
        void refreshDraftState()
        return
      }

      await refreshDraftState()
      setGenerationFailed(false)
      setIsGenerating(false)
      setStatusVariant('success')
      setStatus(
        data.generationTimeMs
          ? `AI draft ready (${Math.round(data.generationTimeMs / 1000)}s).`
          : 'AI draft ready for review.'
      )
      setShowCompare(true)
    } catch {
      setStatusVariant('error')
      setStatus(null)
      setError('Network error while generating. Please try again.')
      setGenerationFailed(true)
      setIsGenerating(false)
    }

    setBusy(false)
    setRetrying(false)
  }

  const handleReview = () => {
    if (!draftPlan) return
    setShowCompare(true)
  }

  const handleEdit = () => {
    if (!draftPlan) return
    savePlanDraftToSession(clientId, planToForm(draftPlan))
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1&draftId=${draftPlan.id}`)
  }

  const handlePublish = async () => {
    if (!draftPlan) return
    setPublishing(true)
    setError('')
    setPublishSuccess(false)
    setStatusVariant('loading')
    setStatus('Publishing plan to client…')

    try {
      const res = await fetch('/api/coach/ai-draft/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          planId: draftPlan.id,
          checkinId,
          checkinWeek: coachingWeek,
        }),
      })
      const data = (await res.json()) as {
        success?: boolean
        error?: string
        alreadyActive?: boolean
        planId?: string
      }

      if (!res.ok || !data.success) {
        setStatus(null)
        setError(data.error ?? 'Failed to publish plan.')
        setPublishing(false)
        return
      }

      const publishedId = data.planId ?? draftPlan.id
      const sync = await syncTrackerAfterPlanPublishAsync(clientId, publishedId)

      void sendClientNotification({
        userId: clientId,
        type: 'plan_delivered',
        title: 'Your plan is ready',
        body: `Version ${draftPlan.version} of your coaching plan is now available.`,
        actionUrl: '/plan',
        metadata: {
          messageSnippet: `Version ${draftPlan.version} of your coaching plan is now available.`,
        },
      })

      setActivePlan({ ...draftPlan, active: true, delivered_at: new Date().toISOString() })
      setDraftPlan(null)
      setPublishing(false)
      setStatusVariant(sync.ok ? 'success' : 'error')
      setStatus(
        sync.ok
          ? 'Plan published to client. Today’s tracker updated.'
          : `Plan published, but tracker sync failed: ${sync.error ?? 'unknown error'}. It will rebuild when the client opens Tracker.`
      )
      setPublishSuccess(true)
      router.push(`/coach/plan/${publishedId}`)
    } catch {
      setStatus(null)
      setError('Network error while publishing. Please try again.')
      setPublishing(false)
    }
  }

  const hasDraft = Boolean(draftPlan)
  const cadenceSkip = autoDraftScheduled === false && !hasDraft && !isGenerating && !busy && !retrying
  const showFailure = generationFailed && !hasDraft && !isGenerating && !busy && !retrying && !cadenceSkip
  const primaryDisabled = busy || publishing || retrying || isGenerating

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ ...s.sectionLabel, margin: 0 }}>AI plan draft</p>
        <AiGenerationStatusBadge info={statusInfo} compact />
      </div>

      <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5 }}>
        {hasDraft
          ? `An AI draft exists for this ${weekLabel} check-in. Review changes, edit if needed, then publish.`
          : cadenceSkip
            ? `This client gets a plan update ${planUpdateCadence?.toLowerCase() ?? 'every 14 days'}. ${weekLabel} is check in only. Next auto draft is week ${nextAutoUpdateWeek ?? '—'}. Generate now only if the plan needs a change.`
            : showFailure
              ? 'Automatic draft generation did not complete. Retry uses your active plan, latest check-in, and cached context.'
              : isGenerating
                ? 'AI is building a draft from this check-in. This usually takes a few minutes for a full week.'
                : 'No AI draft yet. Generate one when you are ready to update the plan.'}
      </p>

      {hasDraft ? (
        <button
          type="button"
          disabled={primaryDisabled}
          onClick={handleReview}
          style={primaryBtnStyle(primaryDisabled)}
          className="btn-press"
        >
          Review AI Draft
        </button>
      ) : showFailure ? (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: colors.danger, fontWeight: 600 }}>
            {failureMessage || 'AI draft unavailable.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              disabled={retrying || busy || isGenerating}
              onClick={() => void queueServerDraft('retry')}
              style={primaryBtnStyle(retrying || busy || isGenerating)}
              className="btn-press"
            >
              {retrying || isGenerating ? 'Retrying…' : 'Retry AI Draft'}
            </button>
            <MessageClientButton
              clientId={clientId}
              label="Message client about the delay"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={primaryDisabled}
          onClick={() => void queueServerDraft('manual')}
          style={primaryBtnStyle(primaryDisabled)}
          className="btn-press"
        >
          {busy || isGenerating ? 'Generating…' : 'Generate AI Draft'}
        </button>
      )}

      {hasDraft && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" onClick={handleEdit} disabled={publishing} style={actionBtn}>
            Edit Draft
          </button>
          <button
            type="button"
            onClick={() => void queueServerDraft('regenerate')}
            disabled={busy || publishing || isGenerating}
            style={actionBtn}
          >
            {busy || isGenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing || busy || isGenerating}
            style={{
              ...actionBtn,
              backgroundColor: colors.successMuted,
              color: colors.success,
              borderColor: colors.success,
            }}
          >
            {publishing ? 'Publishing…' : 'Publish to Client'}
          </button>
        </div>
      )}

      <OptionalCoachNote value={coachNote} onChange={setCoachNote} />
      <GenerationStatus message={status} variant={statusVariant} />
      {error && <div style={s.error}>{error}</div>}
      {publishSuccess && !error && (
        <div style={s.statusSuccess}>Plan delivered successfully.</div>
      )}

      {showCompare && activePlan && draftPlan && (
        <PlanCompareDrawer
          planA={activePlan}
          planB={draftPlan}
          labelA="Current Plan"
          labelB="AI Draft"
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px 20px',
    backgroundColor: colors.accent,
    color: colors.textInverse,
    border: 'none',
    borderRadius: 14,
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxShadow: '0 4px 20px rgba(249, 115, 22, 0.25)',
  }
}

const actionBtn: React.CSSProperties = {
  padding: '10px 14px',
  backgroundColor: colors.bgElevated,
  color: colors.textPrimary,
  border: `1px solid ${colors.borderSubtle}`,
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}
