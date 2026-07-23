'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { CoachShell } from '@/components/ui/CoachShell'
import { colors } from '@/lib/coach-theme'
import { createClient } from '@/lib/supabase/client'
import { requireCoach } from '@/lib/coach-session'
import { INITIAL_PLAN_ACTIONS, mergePlanForms, type AiReasoningDisplay } from '@/lib/coach/ai-actions'
import { runCoachAiAction } from '@/lib/coach/ai-action-client'
import {
  saveAiReasoningToSession,
  savePlanDraftToSession,
  saveWorkoutRetryError,
} from '@/lib/ai/plan-format'
import { getOnboardingLabel } from '@/lib/onboarding'
import { formatFitnessGoal } from '@/lib/coach-utils'
import { persistAiPlanDraft, planToForm, restorePlanAsDraft } from '@/lib/plans'
import { ClientContextCard } from '@/components/coach/ai-actions/ClientContextCard'
import { PlanCompareDrawer } from '@/components/coach/ai-actions/PlanCompareDrawer'
import { PlanVersionList } from '@/components/coach/ai-actions/PlanVersionList'
import { ActionCard, AiReasoningPanel, GenerationStatus, OptionalCoachNote } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import type { Coach, OnboardingProfile, Plan, PlanFormData } from '@/types/database'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import type { InitialPlanGenerationJob } from '@/lib/initial-plan-generation'

const supabase = createClient()
const GENERATION_TIMEOUT_MS = 4 * 60 * 1000

export default function CoachGeneratePlanPage() {
  const router = useRouter()
  const params = useParams()
  const clientId = typeof params.id === 'string' ? params.id : ''

  const [coach, setCoach] = useState<Coach | null>(null)
  const [client, setClient] = useState<OnboardingProfile | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [coachNote, setCoachNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<CoachAiActionId | 'complete' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [stepLabel, setStepLabel] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState('')
  const [reasoning, setReasoning] = useState<AiReasoningDisplay | null>(null)
  const [comparePlans, setComparePlans] = useState<[Plan, Plan] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [backgroundJob, setBackgroundJob] = useState<InitialPlanGenerationJob | null>(null)
  const [retryingBackground, setRetryingBackground] = useState(false)
  const startedAtRef = useRef<number | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    const loadData = async () => {
      const coachData = await requireCoach(supabase, router)
      if (!coachData) return null

      const { data: clientData, error: clientError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', coachData.id)
        .maybeSingle()

      if (clientError || !clientData) return { error: 'Client not found or not assigned to you.' }

      const { data: plansData } = await supabase
        .from('plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('coach_id', coachData.id)
        .order('version', { ascending: false })
      const { data: generationJob } = await supabase
        .from('initial_plan_generation_jobs')
        .select('*')
        .eq('client_id', clientId)
        .eq('coach_id', coachData.id)
        .maybeSingle()

      return {
        coach: coachData,
        client: clientData as OnboardingProfile,
        plans: (plansData as Plan[]) ?? [],
        generationJob: generationJob as InitialPlanGenerationJob | null,
      }
    }

    const init = async () => {
      setError('')
      const result = await loadData()
      if (!result || 'error' in result) {
        setError(result?.error ?? 'Failed to load client.')
        setLoading(false)
        return
      }
      setCoach(result.coach)
      setClient(result.client)
      setPlans(result.plans)
      setBackgroundJob(result.generationJob)
      setLoading(false)
    }
    if (clientId) void init()
  }, [clientId, router])

  useEffect(() => {
    if (!busy) {
      startedAtRef.current = null
      return undefined
    }
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    const timer = setInterval(() => {
      if (!startedAtRef.current) return
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [busy])

  const activePlan = plans.find((p) => p.active) ?? null
  const latestDraft = plans.find((p) => !p.active && !p.delivered_at) ?? null

  const resetGenerationUi = () => {
    setBusy(null)
    setStatus(null)
    setStepLabel(null)
  }

  const openEditor = (formData: PlanFormData, ai?: AiReasoningDisplay | null) => {
    savePlanDraftToSession(clientId, formData)
    if (ai) saveAiReasoningToSession(clientId, ai)
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
  }

  const persistDraftSafely = async (formData: PlanFormData, title: string) => {
    if (!coach || !client) return
    const { error: persistError } = await persistAiPlanDraft(supabase, {
      clientId: client.id,
      coachId: coach.id,
      form: formData,
      title,
    })
    if (persistError) {
      console.warn('[generate-plan] server draft persist failed:', persistError)
    }
  }

  const withTimeout = async <T,>(promise: Promise<T>, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                `${label} is taking longer than 4 minutes. Check your connection and retry — a partial draft may already be saved.`
              )
            )
          }, GENERATION_TIMEOUT_MS)
        }),
      ])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  const runSingleAction = async (actionId: CoachAiActionId) => {
    if (!client || !coach) return
    abortRef.current = false
    setBusy(actionId)
    setError('')
    const label =
      actionId === 'initial_diet'
        ? 'Diet'
        : actionId === 'initial_workout'
          ? 'Workout'
          : actionId === 'initial_cardio'
            ? 'Cardio'
            : 'Supplements'
    setStepLabel(`Step 1 of 1 · ${label}`)
    setStatus(`Generating ${label.toLowerCase()} plan…`)

    try {
      const result = await withTimeout(
        runCoachAiAction({ action: actionId, clientId: client.id, coachNote }),
        `${label} generation`
      )

      if (abortRef.current) return

      if (!result.success || !result.formData) {
        resetGenerationUi()
        setError(result.error ?? 'Generation failed.')
        return
      }

      if (result.aiReasoning) setReasoning(result.aiReasoning)

      const formData = {
        ...result.formData,
        title:
          actionId === 'initial_diet'
            ? 'Diet Plan (Draft)'
            : actionId === 'initial_workout'
              ? 'Workout Plan (Draft)'
              : actionId === 'initial_cardio'
                ? 'Cardio Plan (Draft)'
                : 'Supplement Plan (Draft)',
      }
      await persistDraftSafely(formData, `AI Draft · ${formData.title}`)
      resetGenerationUi()
      openEditor(formData, result.aiReasoning)
    } catch (err) {
      resetGenerationUi()
      setError(err instanceof Error ? err.message : 'Generation failed.')
    }
  }

  const runCompletePlan = async () => {
    if (!client || !coach) return
    abortRef.current = false
    setBusy('complete')
    setError('')
    setStepLabel('Step 1 of 4 · Diet')
    setStatus('Generating diet plan…')

    try {
      const dietResult = await withTimeout(
        runCoachAiAction({
          action: 'initial_diet',
          clientId: client.id,
          coachNote,
        }),
        'Diet generation'
      )

      if (abortRef.current) return

      if (!dietResult.success || !dietResult.formData) {
        resetGenerationUi()
        setError(dietResult.error ?? 'Diet plan generation failed.')
        return
      }

      let merged = {
        ...dietResult.formData,
        title: 'Complete Coaching Plan (Draft)',
      }
      await persistDraftSafely(merged, 'AI Draft · Initial Diet')

      setStepLabel('Step 2 of 4 · Workout')
      setStatus('Diet ready · Generating workout plan…')
      const workoutResult = await withTimeout(
        runCoachAiAction({
          action: 'initial_workout',
          clientId: client.id,
          coachNote,
        }),
        'Workout generation'
      )

      if (abortRef.current) return

      if (workoutResult.aiReasoning) setReasoning(workoutResult.aiReasoning)

      if (!workoutResult.success || !workoutResult.formData) {
        savePlanDraftToSession(clientId, merged)
        saveWorkoutRetryError(clientId, workoutResult.error ?? 'Workout plan generation failed.')
        if (dietResult.aiReasoning) saveAiReasoningToSession(clientId, dietResult.aiReasoning)
        resetGenerationUi()
        router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1&retryWorkout=1`)
        return
      }

      merged = mergePlanForms(merged, {
        workout_plan: workoutResult.formData.workout_plan,
        coach_notes: [merged.coach_notes, workoutResult.formData.coach_notes].filter(Boolean).join('\n\n'),
      })
      await persistDraftSafely(merged, 'AI Draft · Diet + Workout')

      // Soft-fail cardio/supplements: diet + workout must still open for review.
      let cardioReasoning: AiReasoningDisplay | undefined
      let supplementReasoning: AiReasoningDisplay | undefined
      const softFailNotes: string[] = []

      setStepLabel('Step 3 of 4 · Cardio')
      setStatus('Workout ready · Generating cardio plan…')
      try {
        const cardioResult = await withTimeout(
          runCoachAiAction({
            action: 'initial_cardio',
            clientId: client.id,
            coachNote,
          }),
          'Cardio generation'
        )
        if (abortRef.current) return
        if (cardioResult.success && cardioResult.formData?.cardio_plan) {
          merged = mergePlanForms(merged, {
            cardio_plan: cardioResult.formData.cardio_plan,
          })
          cardioReasoning = cardioResult.aiReasoning
          await persistDraftSafely(merged, 'AI Draft · Diet + Workout + Cardio')
        } else {
          softFailNotes.push(cardioResult.error ?? 'Cardio section skipped')
        }
      } catch (cardioErr) {
        softFailNotes.push(
          cardioErr instanceof Error ? cardioErr.message : 'Cardio section skipped'
        )
      }

      if (abortRef.current) return

      setStepLabel('Step 4 of 4 · Supplements')
      setStatus('Generating supplement plan…')
      try {
        const supplementResult = await withTimeout(
          runCoachAiAction({
            action: 'initial_supplements',
            clientId: client.id,
            coachNote,
          }),
          'Supplement generation'
        )
        if (abortRef.current) return
        if (supplementResult.success && supplementResult.formData?.supplement_plan) {
          merged = mergePlanForms(merged, {
            supplement_plan: supplementResult.formData.supplement_plan,
          })
          supplementReasoning = supplementResult.aiReasoning
        } else {
          softFailNotes.push(supplementResult.error ?? 'Supplements section skipped')
        }
      } catch (suppErr) {
        softFailNotes.push(
          suppErr instanceof Error ? suppErr.message : 'Supplements section skipped'
        )
      }

      if (abortRef.current) return

      await persistDraftSafely(merged, 'AI Draft · Initial Plan')
      resetGenerationUi()
      if (softFailNotes.length > 0) {
        setError(
          `Diet and workout are ready. Optional sections need a retry: ${softFailNotes.join(' · ')}`
        )
      }
      openEditor(
        merged,
        supplementReasoning ?? cardioReasoning ?? workoutResult.aiReasoning ?? dietResult.aiReasoning
      )
    } catch (err) {
      resetGenerationUi()
      setError(err instanceof Error ? err.message : 'Generation failed.')
    }
  }

  const cancelGeneration = () => {
    abortRef.current = true
    resetGenerationUi()
    setError('Generation cancelled. You can retry anytime — any completed section may already be saved as a server draft.')
  }

  const handleRestore = async (plan: Plan) => {
    setRestoringId(plan.id)
    setError('')
    const { data, error: restoreError } = await restorePlanAsDraft(supabase, plan)
    setRestoringId(null)
    if (restoreError || !data) {
      setError(restoreError ?? 'Failed to restore plan.')
      return
    }
    savePlanDraftToSession(clientId, planToForm(data))
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
  }

  const retryBackgroundGeneration = async () => {
    if (!backgroundJob || backgroundJob.status !== 'failed') return
    setRetryingBackground(true)
    setError('')
    const response = await fetch('/api/coach/plan-generation/retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobId: backgroundJob.id }),
    })
    const result = await response.json()
    setRetryingBackground(false)
    if (!response.ok) {
      setError(result.error ?? 'Could not retry background generation.')
      return
    }
    setBackgroundJob({ ...backgroundJob, status: 'queued', error_code: null, error_message: null })
  }

  if (!clientId) {
    return (
      <CoachShell narrow>
        <Link href="/coach/clients" style={s.backLink}>← Back to clients</Link>
        <div style={s.error}>Invalid client ID.</div>
      </CoachShell>
    )
  }

  if (loading) {
    return <CoachShell narrow loading><span /></CoachShell>
  }

  if (error && !client) {
    return (
      <CoachShell narrow>
        <Link href={`/coach/client/${clientId}`} style={s.backLink}>← Back to client</Link>
        <div style={s.error}>{error}</div>
      </CoachShell>
    )
  }

  if (!client) return null

  const metricsBlocked = Boolean(client.complexity_input_needs_review)

  return (
    <CoachShell narrow>
          <Link href={`/coach/client/${client.id}`} style={s.backLink}>← Back to client</Link>

          <h1 style={s.title}>{brandTitle('AI coaching actions')}</h1>
          <p style={s.subtitle}>
            {client.name || client.email}
            {coach?.name ? ` · Coach ${coach.name}` : ''}
          </p>

          {metricsBlocked && (
            <div style={s.card}>
              Metrics look unusual on this client profile (height/weight/age). You can still generate and
              deliver plans — double-check numbers if the draft looks off.
              {Array.isArray(client.complexity_input_review_reasons) &&
              client.complexity_input_review_reasons.length > 0
                ? ` ${client.complexity_input_review_reasons.join(' ')}`
                : ''}
            </div>
          )}

          {backgroundJob && (
            <div style={backgroundJob.status === 'failed' ? s.error : s.card}>
              <strong>
                {backgroundJob.status === 'ready'
                  ? 'Ready for coach note/review'
                  : backgroundJob.status === 'generating'
                    ? 'AI diet and workout generation in progress'
                    : backgroundJob.status === 'queued'
                      ? 'AI diet and workout generation queued'
                      : 'Background generation failed'}
              </strong>
              {backgroundJob.status === 'ready' && backgroundJob.draft_plan_id && (
                <div style={{ marginTop: 10 }}>
                  <Link href={`/coach/plan/${backgroundJob.draft_plan_id}`} style={s.noteToggle}>
                    Review draft, add note, and deliver
                  </Link>
                </div>
              )}
              {backgroundJob.status === 'failed' && (
                <div style={{ marginTop: 10 }}>
                  <span>{backgroundJob.error_message ?? 'Generation failed safely.'}</span>
                  <button
                    type="button"
                    style={{ ...s.noteToggle, marginLeft: 8 }}
                    disabled={retryingBackground}
                    onClick={() => void retryBackgroundGeneration()}
                  >
                    {retryingBackground ? 'Queueing…' : 'Retry background generation'}
                  </button>
                </div>
              )}
            </div>
          )}

          <ClientContextCard
            name={client.name || client.email || 'Client'}
            goal={client.fitness_goal}
            activePlan={activePlan}
            latestDraft={latestDraft}
          />

          <div style={s.card}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>Client summary</h2>
            <div style={{ display: 'grid', gap: 8, fontSize: 14, color: colors.textSecondary }}>
              <span>Goal: {formatFitnessGoal(client.fitness_goal)}</span>
              <span>Training: {getOnboardingLabel('training_experience', client.training_experience)}</span>
              <span>Diet: {getOnboardingLabel('diet_preference', client.diet_preference)}</span>
              <span>
                Age / weight: {client.age ?? '—'} yrs · {client.weight ?? '—'} kg
              </span>
            </div>
          </div>

          <p style={s.sectionLabel}>Initial planning</p>
          {INITIAL_PLAN_ACTIONS.map((action) => (
            <ActionCard
              key={action.id}
              title={action.label}
              description={action.description}
              disabled={busy !== null}
              onClick={() => void runSingleAction(action.id)}
            />
          ))}
          <ActionCard
            title="Generate complete plan"
            description="Diet plan first, then workout plan — opens as one draft"
            primary
            disabled={busy !== null}
            onClick={() => void runCompletePlan()}
          />

          <OptionalCoachNote value={coachNote} onChange={setCoachNote} />
          <GenerationStatus
            message={status}
            stepLabel={stepLabel}
            elapsedSeconds={busy ? elapsedSeconds : null}
          />
          {busy && (
            <button type="button" style={s.noteToggle} onClick={cancelGeneration}>
              Cancel generation
            </button>
          )}
          {error && (
            <div style={s.error}>
              {error}
              {!busy && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    style={s.noteToggle}
                    onClick={() => {
                      setError('')
                      void runCompletePlan()
                    }}
                  >
                    Retry complete plan
                  </button>
                </div>
              )}
            </div>
          )}
          <AiReasoningPanel reasoning={reasoning} />

          <p style={s.sectionLabel}>Plan history</p>
          <div style={s.card}>
            <PlanVersionList
              plans={plans}
              onCompare={(a, b) => setComparePlans([a, b])}
              onRestore={handleRestore}
              restoringId={restoringId}
            />
          </div>

      {comparePlans && (
        <PlanCompareDrawer
          planA={comparePlans[0]}
          planB={comparePlans[1]}
          onClose={() => setComparePlans(null)}
        />
      )}
    </CoachShell>
  )
}
