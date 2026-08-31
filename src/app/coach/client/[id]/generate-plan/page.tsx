'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { brandTitle } from '@/lib/brand'
import { CoachShell } from '@/components/ui/CoachShell'
import { colors } from '@/lib/coach-theme'
import { createClient } from '@/lib/supabase/client'
import { requireCoach } from '@/lib/coach-session'
import { INITIAL_PLAN_ACTIONS, type AiReasoningDisplay } from '@/lib/coach/ai-actions'
import { savePlanDraftToSession } from '@/lib/ai/plan-format'
import { getOnboardingLabel } from '@/lib/onboarding'
import { formatFitnessGoal } from '@/lib/coach-utils'
import { planToForm, restorePlanAsDraft } from '@/lib/plans'
import { ClientContextCard } from '@/components/coach/ai-actions/ClientContextCard'
import { PlanCompareDrawer } from '@/components/coach/ai-actions/PlanCompareDrawer'
import { PlanVersionList } from '@/components/coach/ai-actions/PlanVersionList'
import { ActionCard, AiReasoningPanel, GenerationStatus, MessageClientButton, OptionalCoachNote } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import type { Coach, OnboardingProfile, Plan } from '@/types/database'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'
import { getGenerationFailureGuidance } from '@/lib/generation-failure-guidance'
import type { InitialPlanGenerationJob } from '@/lib/initial-plan-generation'

const supabase = createClient()

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

  const queueBackgroundJob = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/coach/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json()) as { success?: boolean; error?: string; message?: string }
    if (!response.ok && response.status !== 202) {
      throw new Error(data.error ?? 'Could not start generation.')
    }
    if (!data.success) throw new Error(data.error ?? 'Could not start generation.')
    return data.message ?? 'Generation continues in the background. You can leave this page.'
  }

  const pollJobStatus = async () => {
    const response = await fetch(`/api/coach/generate-plan/status?clientId=${clientId}`)
    if (!response.ok) return
    const data = (await response.json()) as {
      status: 'idle' | 'generating' | 'ready' | 'failed'
      draftPlanId: string | null
      error: string | null
    }
    if (data.status === 'generating') {
      setBusy((prev) => prev ?? 'complete')
      setStatus('AI is still writing this plan in the background. You can leave this page.')
      return
    }
    if (data.status === 'ready' && data.draftPlanId) {
      if (!busy) return
      resetGenerationUi()
      router.push(`/coach/plan/${data.draftPlanId}`)
      return
    }
    if (data.status === 'failed') {
      resetGenerationUi()
      setError(data.error ?? 'Background generation failed.')
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
    setStepLabel(`Background · ${label}`)
    setStatus(`Queued ${label.toLowerCase()} plan. You can leave this page.`)

    try {
      const message = await queueBackgroundJob({
        clientId: client.id,
        action: actionId,
        coachNote,
        async: true,
      })
      setStatus(message)
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
    setStepLabel('Background · Complete plan')
    setStatus('Queued diet, workout, cardio, and supplements. You can leave this page.')

    try {
      const message = await queueBackgroundJob({
        clientId: client.id,
        complete: true,
        async: true,
        coachNote,
      })
      setStatus(message)
    } catch (err) {
      resetGenerationUi()
      setError(err instanceof Error ? err.message : 'Generation failed.')
    }
  }

  useEffect(() => {
    if (!clientId || loading) return undefined
    const tick = () => {
      void pollJobStatus()
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [clientId, loading])

  const cancelGeneration = () => {
    abortRef.current = true
    resetGenerationUi()
    setError('Stopped watching this page. Generation keeps running in the background.')
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

  const metricsBlocked =
    Boolean(client.complexity_input_needs_review) ||
    (Array.isArray(client.complexity_input_review_reasons) &&
      client.complexity_input_review_reasons.length > 0)

  return (
    <CoachShell narrow>
          <Link href={`/coach/client/${client.id}`} style={s.backLink}>← Back to client</Link>

          <h1 style={s.title}>{brandTitle('AI coaching actions')}</h1>
          <p style={s.subtitle}>
            Generate a complete plan or a single section. Work continues in the background if you leave this page.
          </p>

          {metricsBlocked && (
            <div style={s.error}>
              Auto plan generation is blocked until height, weight, and age look realistic.
              Fix metrics on the client profile, then retry background generation — or message the
              client now so they know what is going on.
              {Array.isArray(client.complexity_input_review_reasons) &&
              client.complexity_input_review_reasons.length > 0
                ? ` ${client.complexity_input_review_reasons.join(' ')}`
                : ''}
              <MessageClientButton
                clientId={client.id}
                label="Message client about metrics"
              />
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                    <Link
                      href={`/coach/plan/${backgroundJob.draft_plan_id}?regen=1`}
                      style={s.noteToggle}
                    >
                      Regenerate with coach instruction
                    </Link>
                    <Link
                      href={`/coach/plan/${backgroundJob.draft_plan_id}?remake=1`}
                      style={s.noteToggle}
                    >
                      Remake from scratch
                    </Link>
                  </div>
                </div>
              )}
              {backgroundJob.status === 'failed' && (() => {
                const guidance = getGenerationFailureGuidance(
                  backgroundJob.error_code,
                  backgroundJob.error_message
                )
                return (
                  <div style={{ marginTop: 10 }}>
                    <span>{guidance.summary}</span>
                    <div style={{ marginTop: 10 }}>
                      <strong style={{ display: 'block', marginBottom: 6 }}>What to do next</strong>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        {guidance.nextSteps.map((step) => (
                          <li key={step} style={{ marginBottom: 4 }}>{step}</li>
                        ))}
                      </ol>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 8 }}>
                      <button
                        type="button"
                        style={s.noteToggle}
                        disabled={retryingBackground}
                        onClick={() => void retryBackgroundGeneration()}
                      >
                        {retryingBackground ? 'Queueing…' : 'Retry background generation'}
                      </button>
                      <MessageClientButton
                        clientId={client.id}
                        label={
                          guidance.code === 'photo_unavailable'
                            ? 'Ask client to re-upload photos'
                            : guidance.code === 'metrics_review'
                              ? 'Message client about metrics'
                              : 'Message client about the delay'
                        }
                      />
                    </div>
                  </div>
                )
              })()}
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
              {client.onboarding_data?.diet?.customNotes?.trim() ? (
                <span>Diet exceptions: {client.onboarding_data.diet.customNotes.trim()}</span>
              ) : null}
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
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
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
                  <MessageClientButton
                    clientId={client.id}
                    label="Message client about the issue"
                  />
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
