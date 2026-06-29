'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import CoachNavbar from '../../../../components/CoachNavbar'
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
import { planToForm, restorePlanAsDraft } from '@/lib/plans'
import { ClientContextCard } from '@/components/coach/ai-actions/ClientContextCard'
import { PlanCompareDrawer } from '@/components/coach/ai-actions/PlanCompareDrawer'
import { PlanVersionList } from '@/components/coach/ai-actions/PlanVersionList'
import { ActionCard, AiReasoningPanel, GenerationStatus, OptionalCoachNote } from '@/components/coach/ai-actions/shared'
import { aiActionStyles as s } from '@/components/coach/ai-actions/styles'
import type { Coach, OnboardingProfile, Plan } from '@/types/database'
import type { CoachAiActionId } from '@/lib/coach/ai-actions'

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
  const [error, setError] = useState('')
  const [reasoning, setReasoning] = useState<AiReasoningDisplay | null>(null)
  const [comparePlans, setComparePlans] = useState<[Plan, Plan] | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

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

      return {
        coach: coachData,
        client: clientData as OnboardingProfile,
        plans: (plansData as Plan[]) ?? [],
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
      setLoading(false)
    }
    if (clientId) void init()
  }, [clientId, router])

  const activePlan = plans.find((p) => p.active) ?? null
  const latestDraft = plans.find((p) => !p.active && !p.delivered_at) ?? null

  const openEditor = (formData: Parameters<typeof savePlanDraftToSession>[1], ai?: AiReasoningDisplay | null) => {
    savePlanDraftToSession(clientId, formData)
    if (ai) saveAiReasoningToSession(clientId, ai)
    router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1`)
  }

  const runSingleAction = async (actionId: CoachAiActionId) => {
    if (!client) return
    setBusy(actionId)
    setError('')
    setStatus(`Generating ${actionId === 'initial_diet' ? 'diet plan' : 'workout plan'}…`)

    const result = await runCoachAiAction({ action: actionId, clientId: client.id, coachNote })
    setBusy(null)
    setStatus(null)

    if (!result.success || !result.formData) {
      setError(result.error ?? 'Generation failed.')
      return
    }

    if (result.aiReasoning) setReasoning(result.aiReasoning)

    openEditor(
      {
        ...result.formData,
        title: actionId === 'initial_diet' ? 'Diet Plan (Draft)' : 'Workout Plan (Draft)',
      },
      result.aiReasoning
    )
  }

  const runCompletePlan = async () => {
    if (!client) return
    setBusy('complete')
    setError('')

    setStatus('Generating diet plan…')
    const dietResult = await runCoachAiAction({
      action: 'initial_diet',
      clientId: client.id,
      coachNote,
    })

    if (!dietResult.success || !dietResult.formData) {
      setBusy(null)
      setStatus(null)
      setError(dietResult.error ?? 'Diet plan generation failed.')
      return
    }

    let merged = {
      ...dietResult.formData,
      title: 'Complete Coaching Plan (Draft)',
    }

    setStatus('Diet ready · Generating workout plan…')
    const workoutResult = await runCoachAiAction({
      action: 'initial_workout',
      clientId: client.id,
      coachNote,
    })

    setBusy(null)
    setStatus(null)

    if (workoutResult.aiReasoning) setReasoning(workoutResult.aiReasoning)

    if (!workoutResult.success || !workoutResult.formData) {
      savePlanDraftToSession(clientId, merged)
      saveWorkoutRetryError(clientId, workoutResult.error ?? 'Workout plan generation failed.')
      if (dietResult.aiReasoning) saveAiReasoningToSession(clientId, dietResult.aiReasoning)
      router.push(`/coach/plan/new?clientId=${clientId}&fromAi=1&retryWorkout=1`)
      return
    }

    merged = mergePlanForms(merged, {
      workout_plan: workoutResult.formData.workout_plan,
      cardio_plan: workoutResult.formData.cardio_plan,
      coach_notes: [merged.coach_notes, workoutResult.formData.coach_notes].filter(Boolean).join('\n\n'),
    })

    openEditor(merged, workoutResult.aiReasoning ?? dietResult.aiReasoning)
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

  if (!clientId) {
    return (
      <>
        <CoachNavbar />
        <div style={s.container}>
          <Link href="/coach/clients" style={s.backLink}>← Back to clients</Link>
          <div style={s.error}>Invalid client ID.</div>
        </div>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={{ ...s.container, textAlign: 'center', color: '#666', paddingTop: 80 }}>Loading…</div>
      </>
    )
  }

  if (error && !client) {
    return (
      <>
        <CoachNavbar />
        <div style={s.container}>
          <Link href={`/coach/client/${clientId}`} style={s.backLink}>← Back to client</Link>
          <div style={s.error}>{error}</div>
        </div>
      </>
    )
  }

  if (!client) return null

  return (
    <>
      <CoachNavbar />
      <div style={s.page}>
        <div style={s.container}>
          <Link href={`/coach/client/${client.id}`} style={s.backLink}>← Back to client</Link>

          <h1 style={s.title}>AI coaching actions</h1>
          <p style={s.subtitle}>
            {client.name || client.email}
            {coach?.name ? ` · Coach ${coach.name}` : ''}
          </p>

          <ClientContextCard
            name={client.name || client.email || 'Client'}
            goal={client.fitness_goal}
            activePlan={activePlan}
            latestDraft={latestDraft}
          />

          <div style={s.card}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 }}>Client summary</h2>
            <div style={{ display: 'grid', gap: 8, fontSize: 14, color: '#444' }}>
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
          <GenerationStatus message={status} />
          {error && <div style={s.error}>{error}</div>}
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
        </div>
      </div>

      {comparePlans && (
        <PlanCompareDrawer
          planA={comparePlans[0]}
          planB={comparePlans[1]}
          onClose={() => setComparePlans(null)}
        />
      )}
    </>
  )
}
