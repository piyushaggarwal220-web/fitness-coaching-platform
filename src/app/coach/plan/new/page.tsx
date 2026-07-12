'use client';

import { Suspense, useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { brandTitle } from '@/lib/brand';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/design-tokens';
import { PlanEditor } from '@/components/PlanEditor';
import { AiReasoningPanel } from '@/components/coach/ai-actions/shared';
import {
  clearPlanDraftFromSession,
  clearWorkoutRetryError,
  loadAiReasoningFromSession,
  loadPlanDraftFromSession,
  loadWorkoutRetryError,
  savePlanDraftToSession,
} from '@/lib/ai/plan-format';
import { mergePlanForms } from '@/lib/coach/ai-actions';
import { runCoachAiAction } from '@/lib/coach/ai-action-client';
import type { AiReasoningDisplay } from '@/lib/coach/ai-actions';
import { activatePlan, getNextPlanVersion, INITIAL_PLAN_FORM, validatePlanForm } from '@/lib/plans';
import { clientCoachNotes } from '@/lib/plan-metadata';
import { createClient } from '@/lib/supabase/client';
import { requireCoach } from '@/lib/coach-session';
import type { ClientProfile, Coach, PlanFormData } from '@/types/database';

type ClientOption = Pick<ClientProfile, 'id' | 'name' | 'email' | 'coach_id'>;

const supabase = createClient();

function CoachNewPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdParam = searchParams.get('clientId') ?? '';
  const fromAi = searchParams.get('fromAi') === '1';
  const retryWorkout = searchParams.get('retryWorkout') === '1';

  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState<PlanFormData>(INITIAL_PLAN_FORM);
  const [aiDraftLoaded, setAiDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [retryingWorkout, setRetryingWorkout] = useState(false);
  const [workoutRetryError, setWorkoutRetryError] = useState<string | null>(null);
  const [aiReasoning, setAiReasoning] = useState<AiReasoningDisplay | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('id, name, email, coach_id')
        .eq('coach_id', coachData.id)
        .order('name');

      if (clientsError) {
        setLoadError('Failed to load clients. Please try again.');
        setLoading(false);
        return;
      }

      const list = clientsData ?? [];
      setClients(list);

      const targetClientId = clientIdParam || list[0]?.id || '';
      let nextForm: PlanFormData = { ...INITIAL_PLAN_FORM, client_id: targetClientId };

      if (fromAi && clientIdParam) {
        const draft = loadPlanDraftFromSession(clientIdParam);
        if (draft) {
          nextForm = draft;
          setAiDraftLoaded(true);
        }
        if (retryWorkout) {
          setWorkoutRetryError(loadWorkoutRetryError(clientIdParam));
        }
        const reasoning = loadAiReasoningFromSession<AiReasoningDisplay>(clientIdParam);
        if (reasoning) setAiReasoning(reasoning);
      }

      setForm(nextForm);
      setLoading(false);
    };
    load();
  }, [router, clientIdParam, fromAi, retryWorkout]);

  const handleRetryWorkout = async () => {
    if (!form.client_id) return;
    setRetryingWorkout(true);
    setError('');

    const result = await runCoachAiAction({
      action: 'initial_workout',
      clientId: form.client_id,
    });

    setRetryingWorkout(false);

    if (!result.success || !result.formData) {
      setWorkoutRetryError(result.error ?? 'Workout plan generation failed.');
      return;
    }

    const merged = mergePlanForms(form, {
      workout_plan: result.formData.workout_plan,
      cardio_plan: result.formData.cardio_plan,
      coach_notes: [form.coach_notes, result.formData.coach_notes].filter(Boolean).join('\n\n'),
      title: 'Complete Coaching Plan (Draft)',
    });

    setForm(merged);
    savePlanDraftToSession(form.client_id, merged);
    clearWorkoutRetryError(form.client_id);
    setWorkoutRetryError(null);
    if (result.aiReasoning) setAiReasoning(result.aiReasoning);
    router.replace(`/coach/plan/new?clientId=${form.client_id}&fromAi=1`);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSave = async (deliver: boolean) => {
    const validationError = validatePlanForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!coach) return;

    setSubmitting(true);
    setError('');

    const version = await getNextPlanVersion(supabase, form.client_id);
    const now = new Date().toISOString();

    const { data: created, error: insertError } = await supabase
      .from('plans')
      .insert({
        client_id: form.client_id,
        coach_id: coach.id,
        title: form.title.trim(),
        phase: form.phase.trim() || null,
        workout_plan: form.workout_plan.trim() || null,
        nutrition_plan: form.nutrition_plan.trim() || null,
        cardio_plan: form.cardio_plan.trim() || null,
        supplement_plan: form.supplement_plan.trim() || null,
        coach_notes: clientCoachNotes(form.coach_notes).trim() || null,
        version,
        active: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError || !created) {
      setError(insertError?.message ?? 'Failed to create plan.');
      setSubmitting(false);
      return;
    }

    if (deliver) {
      const { error: activateError } = await activatePlan(supabase, created);
      if (activateError) {
        setError('Plan saved as draft but delivery failed: ' + activateError);
        setSubmitting(false);
        return;
      }
    }

    if (fromAi && form.client_id) {
      clearPlanDraftFromSession(form.client_id);
    }

    router.push(`/coach/plan/${created.id}`);
  };

  if (loading) {
    return <CoachShell narrow loading><span /></CoachShell>;
  }

  if (loadError) {
    return (
      <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <div style={styles.errorBox}>
          <p>{loadError}</p>
          <button style={styles.retryBtn} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </CoachShell>
    );
  }

  return (
    <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <h1 style={styles.title}>{aiDraftLoaded ? brandTitle('Review AI plan draft') : brandTitle('Create new plan')}</h1>

        {aiDraftLoaded && (
          <div style={styles.aiBanner}>
            AI-generated draft loaded. Edit any section, then save as draft or deliver to the client.
          </div>
        )}

        {workoutRetryError && (
          <div style={styles.workoutRetryBanner}>
            <p style={{ margin: '0 0 12px 0' }}>
              Diet plan was generated successfully, but workout generation failed: {workoutRetryError}
            </p>
            <button
              type="button"
              disabled={retryingWorkout}
              onClick={() => void handleRetryWorkout()}
              style={styles.retryWorkoutBtn}
            >
              {retryingWorkout ? 'Retrying workout…' : 'Retry workout'}
            </button>
          </div>
        )}

        <AiReasoningPanel reasoning={aiReasoning} />

        {clients.length === 0 && (
          <div style={styles.warning}>No assigned clients. Assign clients before creating plans.</div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.form}>
          <PlanEditor form={form} onChange={handleChange} clients={clients} />

          <div style={styles.actions}>
            <button
              type="button"
              disabled={submitting || clients.length === 0}
              onClick={() => handleSave(false)}
              style={styles.secondaryBtn}
            >
              {submitting ? 'Saving...' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={submitting || clients.length === 0}
              onClick={() => handleSave(true)}
              style={styles.primaryBtn}
            >
              {submitting ? 'Delivering...' : 'Deliver to client'}
            </button>
          </div>
        </div>
    </CoachShell>
  );
}

export default function CoachNewPlanPage() {
  return (
    <Suspense fallback={<CoachShell narrow loading><span /></CoachShell>}>
      <CoachNewPlanForm />
    </Suspense>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  container: coachPageStyles.containerNarrow,
  backLink: coachPageStyles.backLink,
  title: coachPageStyles.title,
  form: coachPageStyles.card,
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  primaryBtn: { ...coachPageStyles.primaryBtn, flex: 1, minWidth: 160 },
  secondaryBtn: { ...coachPageStyles.secondaryBtn, flex: 1, minWidth: 160 },
  warning: { backgroundColor: colors.warningMuted, color: colors.warning, padding: 12, borderRadius: 12, marginBottom: 16 },
  aiBanner: { backgroundColor: colors.accentMuted, color: colors.accent, padding: 12, borderRadius: 12, marginBottom: 16, fontSize: 14 },
  workoutRetryBanner: { backgroundColor: colors.warningMuted, color: colors.warning, padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 14 },
  retryWorkoutBtn: coachPageStyles.secondaryBtn,
  errorBox: { ...coachPageStyles.card, textAlign: 'center', borderColor: colors.danger },
  retryBtn: coachPageStyles.primaryBtn,
};
