'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AiReasoningDisplay } from '@/lib/coach/ai-actions'
import { mergePlanForms } from '@/lib/coach/ai-actions'
import { runCoachAiAction } from '@/lib/coach/ai-action-client'
import { resolveAiGenerationStatus } from '@/lib/ai/draft-status'
import {
  saveAiReasoningToSession,
  savePlanDraftToSession,
  saveWorkoutRetryError,
} from '@/lib/ai/plan-format'
import { createClient } from '@/lib/supabase/client'
import { activatePlan, getNextPlanVersion, planToForm } from '@/lib/plans'
import { syncTrackerAfterPlanPublishAsync } from '@/lib/daily-tracker/client-sync'
import { clientCoachNotes, encodePlanMeta, planMatchesCheckin } from '@/lib/plan-metadata'
import { sendClientNotification } from '@/lib/notifications/client'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/coach-theme'
import { AiGenerationStatusBadge } from '@/components/coach/AiGenerationStatusBadge'
import { AiReasoningPanel, GenerationStatus, OptionalCoachNote } from './shared'
import { PlanCompareDrawer } from './PlanCompareDrawer'
import { aiActionStyles as s } from './styles'
import type { Plan, PlanFormData } from '@/types/database'

const supabase = createClient()

type WeeklyCoachingPanelProps = {
  clientId: string
  checkinId: string
  coachId: string
  coachingWeek?: number | null
  checkinSubmittedAt?: string | null
}

function planToCompareForm(plan: Plan): PlanFormData {
  return planToForm(plan)
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
  coachId,
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
  const [reasoning, setReasoning] = useState<AiReasoningDisplay | null>(null)
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [draftPlan, setDraftPlan] = useState<Plan | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [failureMessage, setFailureMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)

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
    setDraftPlan(draft)

    try {
      const res = await fetch(
        `/api/coach/ai-draft/status?clientId=${encodeURIComponent(clientId)}&checkinId=${encodeURIComponent(checkinId)}`
      )
      if (res.ok) {
        const data = (await res.json()) as {
          isGenerating?: boolean
          generationFailed?: boolean
          failureError?: string | null
        }
        setIsGenerating(Boolean(data.isGenerating) && !draft)
        setGenerationFailed(Boolean(data.generationFailed) && !draft)
        setFailureMessage(data.failureError?.trim() ?? '')
      }
    } catch {
      const submitted = checkinSubmittedAt ? new Date(checkinSubmittedAt).getTime() : 0
      const recent = submitted > 0 && Date.now() - submitted < 12 * 60 * 1000
      setIsGenerating(!draft && recent)
      setGenerationFailed(false)
    }
  }, [clientId, checkinId, checkinSubmittedAt])

  useEffect(() => {
    void refreshDraftState()
  }, [refreshDraftState])

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

  const generateDraft = async (mode: 'manual' | 'regenerate') => {
    setBusy(true)
    setError('')
    setPublishSuccess(false)
    setStatusVariant('loading')
    setStatus(
      mode === 'regenerate'
        ? 'Regenerating AI draft from active plan and latest check-in…'
        : 'Gathering client context and generating AI draft…'
    )

    const dietResult = await runCoachAiAction({
      action: 'review_update_diet',
      clientId,
      checkinId,
      coachNote,
    })

    if (!dietResult.success || !dietResult.formData) {
      setBusy(false)
      setStatus(null)
      setError(dietResult.error ?? 'Diet update failed.')
      setGenerationFailed(true)
      return
    }

    if (dietResult.aiReasoning) {
      setReasoning(dietResult.aiReasoning)
      saveAiReasoningToSession(clientId, dietResult.aiReasoning)
    }

    setStatus('Diet ready. Generating updated workout…')

    const workoutResult = await runCoachAiAction({
      action: 'review_update_workout',
      clientId,
      checkinId,
      coachNote,
      draftPlanContext: dietResult.formData,
    })

    if (!workoutResult.success || !workoutResult.formData) {
      savePlanDraftToSession(clientId, dietResult.formData)
      saveWorkoutRetryError(clientId, workoutResult.error ?? 'Workout update failed.')
      setBusy(false)
      setStatus(null)
      setError(workoutResult.error ?? 'Workout update failed. Diet draft saved in session.')
      setGenerationFailed(true)
      return
    }

    setStatus('Workout ready. Generating updated cardio…')
    const cardioResult = await runCoachAiAction({
      action: 'review_update_cardio',
      clientId,
      checkinId,
      coachNote,
      draftPlanContext: {
        ...dietResult.formData,
        workout_plan: workoutResult.formData.workout_plan,
      },
    })

    if (!cardioResult.success || !cardioResult.formData) {
      const partial = mergePlanForms(dietResult.formData, {
        workout_plan: workoutResult.formData.workout_plan,
      })
      savePlanDraftToSession(clientId, partial)
      setBusy(false)
      setStatus(null)
      setError(cardioResult.error ?? 'Cardio update failed. Diet and workout draft saved.')
      setGenerationFailed(true)
      return
    }

    setStatus('Cardio ready. Generating updated supplements…')
    const supplementResult = await runCoachAiAction({
      action: 'review_update_supplements',
      clientId,
      checkinId,
      coachNote,
      draftPlanContext: {
        ...dietResult.formData,
        workout_plan: workoutResult.formData.workout_plan,
        cardio_plan: cardioResult.formData.cardio_plan,
      },
    })

    if (!supplementResult.success || !supplementResult.formData) {
      const partial = mergePlanForms(dietResult.formData, {
        workout_plan: workoutResult.formData.workout_plan,
        cardio_plan: cardioResult.formData.cardio_plan,
      })
      savePlanDraftToSession(clientId, partial)
      setBusy(false)
      setStatus(null)
      setError(supplementResult.error ?? 'Supplement update failed. Other drafts saved.')
      setGenerationFailed(true)
      return
    }

    const merged = mergePlanForms(
      {
        ...dietResult.formData,
        title: coachingWeek ? `AI Draft · Week ${coachingWeek}` : 'AI Draft · Weekly Update',
      },
      {
        workout_plan: workoutResult.formData.workout_plan,
        cardio_plan: cardioResult.formData.cardio_plan,
        supplement_plan: supplementResult.formData.supplement_plan,
        coach_notes: [dietResult.formData.coach_notes, workoutResult.formData.coach_notes]
          .filter(Boolean)
          .join('\n\n'),
      }
    )

    setStatus('Preparing client coach message…')

    let clientMessage = clientCoachNotes(merged.coach_notes)
    try {
      const messageRes = await fetch('/api/coach/ai-draft/coach-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          checkinId,
          mergedNotes: merged.coach_notes,
          draftContext: {
            title: merged.title,
            phase: merged.phase,
            workout_plan: merged.workout_plan,
            nutrition_plan: merged.nutrition_plan,
            cardio_plan: merged.cardio_plan,
            supplement_plan: merged.supplement_plan,
          },
        }),
      })
      if (messageRes.ok) {
        const messageData = (await messageRes.json()) as { coachNotes?: string }
        if (messageData.coachNotes?.trim()) {
          clientMessage = messageData.coachNotes.trim()
        }
      }
    } catch {
      if (!clientMessage) {
        clientMessage = 'Great work this week — keep building on your consistency. Your coach will follow up with any adjustments.'
      }
    }

    const metaNotes = encodePlanMeta(
      {
        checkinId,
        week: coachingWeek ?? undefined,
        generatedBy: 'ai',
        source: coachingWeek ? `Week ${coachingWeek} Check-in` : `${weekLabel} Check-in`,
      },
      clientMessage
    )

    const now = new Date().toISOString()
    const existingDraft = await findDraftForCheckin(clientId, checkinId)
    const draftFields = {
      title: merged.title,
      phase: merged.phase?.trim() || activePlan?.phase || null,
      workout_plan: merged.workout_plan?.trim() || null,
      nutrition_plan: merged.nutrition_plan?.trim() || null,
      cardio_plan: merged.cardio_plan?.trim() || null,
      supplement_plan: merged.supplement_plan?.trim() || null,
      coach_notes: metaNotes,
      updated_at: now,
    }

    let saved: Plan | null = null
    let saveError: { message: string } | null = null

    if (existingDraft) {
      const { data, error } = await supabase
        .from('plans')
        .update(draftFields)
        .eq('id', existingDraft.id)
        .select()
        .single()
      saved = (data as Plan | null) ?? null
      saveError = error
    } else {
      const version = await getNextPlanVersion(supabase, clientId)
      const { data, error } = await supabase
        .from('plans')
        .insert({
          client_id: clientId,
          coach_id: coachId,
          ...draftFields,
          version,
          active: false,
          created_at: now,
        })
        .select()
        .single()
      saved = (data as Plan | null) ?? null
      saveError = error
    }

    setBusy(false)

    if (saveError || !saved) {
      setStatus(null)
      setError(saveError?.message ?? 'Failed to save draft.')
      setGenerationFailed(true)
      return
    }

    const finalReasoning = workoutResult.aiReasoning ?? dietResult.aiReasoning
    if (finalReasoning) {
      setReasoning(finalReasoning)
      saveAiReasoningToSession(clientId, finalReasoning)
    }

    setDraftPlan(saved as Plan)
    setGenerationFailed(false)
    setIsGenerating(false)
    setStatusVariant('success')
    setStatus('AI draft ready for review.')
    setShowCompare(true)
  }

  const retryDraft = async () => {
    setRetrying(true)
    setError('')
    setPublishSuccess(false)
    setStatusVariant('loading')
    setStatus('Retrying AI draft — reusing active plan, check-in, and prompt cache…')

    try {
      const res = await fetch('/api/coach/ai-draft/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, checkinId, coachingWeek }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string; planId?: string }

      if (!res.ok || !data.success) {
        setStatusVariant('error')
        setStatus(null)
        const message = data.error ?? 'Retry failed. Please try again.'
        setError(message)
        setFailureMessage(message)
        setGenerationFailed(true)
        setRetrying(false)
        return
      }

      await refreshDraftState()
      setGenerationFailed(false)
      setStatusVariant('success')
      setStatus(`AI draft ready (${Math.round((data as { generationTimeMs?: number }).generationTimeMs ?? 0) / 1000}s).`)
      setShowCompare(true)
    } catch {
      setStatusVariant('error')
      setStatus(null)
      setError('Network error while retrying. Please try again.')
      setGenerationFailed(true)
    }

    setRetrying(false)
  }

  const handleReview = () => {
    if (!draftPlan) return
    setShowCompare(true)
  }

  const handleEdit = () => {
    if (!draftPlan) return
    savePlanDraftToSession(clientId, planToCompareForm(draftPlan))
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1&draftId=${draftPlan.id}`)
  }

  const handlePublish = async () => {
    if (!draftPlan) return
    setPublishing(true)
    setError('')
    setPublishSuccess(false)
    setStatusVariant('loading')
    setStatus('Publishing plan to client…')

    const { error: activateError } = await activatePlan(supabase, {
      id: draftPlan.id,
      client_id: clientId,
      coach_id: coachId,
    })

    if (activateError) {
      setStatus(null)
      setError(activateError)
      setPublishing(false)
      return
    }

    const sync = await syncTrackerAfterPlanPublishAsync(clientId, draftPlan.id)

    void fetch('/api/coach/ai-draft/publish-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        planId: draftPlan.id,
        planVersion: draftPlan.version,
        checkinId,
        checkinWeek: coachingWeek,
      }),
    })

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
    router.push(`/coach/plan/${draftPlan.id}`)
  }

  const hasDraft = Boolean(draftPlan)
  const showFailure = generationFailed && !hasDraft && !isGenerating && !busy && !retrying
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
          : showFailure
            ? 'Automatic draft generation did not complete. Retry uses your active plan, latest check-in, and cached context.'
            : isGenerating
              ? 'AI is building a draft from this check-in. This usually takes under a minute.'
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
          <button
            type="button"
            disabled={retrying || busy}
            onClick={() => void retryDraft()}
            style={primaryBtnStyle(retrying || busy)}
            className="btn-press"
          >
            {retrying ? 'Retrying…' : 'Retry AI Draft'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={primaryDisabled}
          onClick={() => void generateDraft('manual')}
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
            onClick={() => void generateDraft('regenerate')}
            disabled={busy || publishing}
            style={actionBtn}
          >
            {busy ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing || busy}
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
      <AiReasoningPanel reasoning={reasoning} />

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
