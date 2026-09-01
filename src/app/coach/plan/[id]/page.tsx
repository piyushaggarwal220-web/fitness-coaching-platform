'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/coach-theme';
import { PlanEditor } from '@/components/PlanEditor';
import { PlanDraftReviewActions } from '@/components/coach/PlanDraftReviewActions';
import { evaluateHighFluxPlanReview } from '@/lib/ai/high-flux-review';
import {
  activatePlan,
  deactivatePlan,
  formatPlanDate,
  getNextPlanVersion,
  invalidatePlanEdit,
  planToForm,
  validatePlanForm,
} from '@/lib/plans'
import { prepareCoachNotesForSave } from '@/lib/plan-metadata';
import { prepareNutritionPlanForSave, parseHeaderCalories } from '@/lib/ai/nutrition-macro-sync';
import { resolveDietFloorKcal } from '@/lib/ai/plan-quality-rules';
import { syncTrackerAfterPlanPublishAsync } from '@/lib/daily-tracker/client-sync';
import { requireCoach } from '@/lib/coach-session';
import { PlanVersionHistory } from '@/components/coach/PlanVersionHistory';
import type { OnboardingProfile, Plan, PlanFormData, PlanWithClient } from '@/types/database';

const supabase = createClient();

export default function CoachPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const planId = typeof params.id === 'string' ? params.id : '';
  const openAiOnLoad = searchParams.get('ai') === '1';
  const initialReviewAction =
    searchParams.get('regen') === '1' ? 'regen' : searchParams.get('remake') === '1' ? 'remake' : null;

  const [plan, setPlan] = useState<PlanWithClient | null>(null);
  const [history, setHistory] = useState<Plan[]>([]);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [form, setForm] = useState<PlanFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clientProfile, setClientProfile] = useState<Pick<
    OnboardingProfile,
    'weight' | 'fitness_goal' | 'onboarding_data' | 'sleep_duration' | 'training_experience' | 'injuries'
  > | null>(null);
  const [initialReviewActionConsumed, setInitialReviewActionConsumed] = useState(false);
  const reviewAction =
    initialReviewActionConsumed || !initialReviewAction ? null : initialReviewAction;
  const [autoOpenAiSection, setAutoOpenAiSection] = useState<'nutrition' | 'workout' | null>(
    openAiOnLoad ? 'nutrition' : null
  );

  const highFluxFlags = useMemo(() => {
    if (!clientProfile || !form) return [];
    return evaluateHighFluxPlanReview({
      profile: clientProfile,
      nutritionPlan: form.nutrition_plan,
      cardioPlan: form.cardio_plan,
      workoutPlan: form.workout_plan,
    });
  }, [clientProfile, form]);

  useEffect(() => {
    const load = async () => {
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoachName(coachData.name ?? null);

      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('*, profiles:client_id(name, email)')
        .eq('id', planId)
        .eq('coach_id', coachData.id)
        .single();

      if (planError || !planData) {
        setError('Plan not found.');
        setLoading(false);
        return;
      }

      const record = planData as PlanWithClient;
      setPlan(record);
      setForm(planToForm(record));

      const { data: profileData } = await supabase
        .from('profiles')
        .select('weight, fitness_goal, onboarding_data, sleep_duration, training_experience, injuries')
        .eq('id', record.client_id)
        .single();

      if (profileData) {
        setClientProfile(profileData);
      }

      const { data: historyData } = await supabase
        .from('plans')
        .select('*')
        .eq('client_id', record.client_id)
        .eq('coach_id', coachData.id)
        .order('version', { ascending: false });

      setHistory(historyData ?? []);
      setLoading(false);
    };

    load();
  }, [planId, router]);

  useEffect(() => {
    if (!openAiOnLoad) return;
    setAutoOpenAiSection('nutrition');
  }, [openAiOnLoad]);

  if (!planId) {
    return (
      <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <div style={styles.errorBox}>Invalid plan ID.</div>
      </CoachShell>
    );
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!form) return;
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleFormPatch = (patch: Partial<PlanFormData>) => {
    if (!form) return;
    setForm({ ...form, ...patch });
    setError('');
    setSuccess('AI revision applied to the editor. Save or deliver to update the client tracker.');
  };

  const clearReviewQueryParams = () => {
    setInitialReviewActionConsumed(true);
    if (initialReviewAction) {
      router.replace(`/coach/plan/${planId}`);
    }
  };

  const isDraftForReview = Boolean(plan && !plan.active && !plan.delivered_at);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !plan) return;

    const validationError = validatePlanForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const syncedNutrition = form.nutrition_plan.trim()
      ? prepareNutritionPlanForSave(form.nutrition_plan, {
          previousCalories: parseHeaderCalories(plan.nutrition_plan),
          floorKcal: clientProfile?.weight
            ? resolveDietFloorKcal(clientProfile.weight)
            : undefined,
        })
      : null;

    const { error: updateError } = await supabase
      .from('plans')
      .update({
        title: form.title.trim(),
        phase: form.phase.trim() || null,
        workout_plan: form.workout_plan.trim() || null,
        nutrition_plan: syncedNutrition,
        cardio_plan: form.cardio_plan.trim() || null,
        supplement_plan: form.supplement_plan.trim() || null,
        coach_notes: prepareCoachNotesForSave(form.coach_notes, plan),
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      const savedAt = new Date().toISOString();
      const savedForm = syncedNutrition
        ? { ...form, nutrition_plan: syncedNutrition }
        : form;
      setForm(savedForm);
      setPlan({ ...plan, ...savedForm, updated_at: savedAt });
      invalidatePlanEdit(plan.client_id);
      if (plan.active) {
        const sync = await syncTrackerAfterPlanPublishAsync(plan.client_id, plan.id);
        if (sync.ok) {
          setSuccess('Plan saved. Client daily tracker updated for today.');
        } else {
          setError(
            `Plan saved, but tracker sync failed: ${sync.error ?? 'unknown error'}. Fix sync or have the client reopen Tracker so today’s snapshot rebuilds.`
          );
        }
      } else {
        setSuccess('Plan saved. Deliver to client when ready so tracker uses this version.');
      }
    }
    setSaving(false);
  };

  const handleActivate = async () => {
    if (!plan) return;
    setActionLoading(true);
    setError('');
    const { error: activateError } = await activatePlan(supabase, plan);
    if (activateError) setError(activateError);
    else {
      const sync = await syncTrackerAfterPlanPublishAsync(plan.client_id, plan.id);
      setSuccess(
        sync.ok
          ? 'Plan delivered. Client tracker updated for today.'
          : `Plan delivered, but tracker sync failed: ${sync.error ?? 'unknown error'}.`
      );
      setPlan({ ...plan, active: true, delivered_at: new Date().toISOString() });
      setHistory((h) => h.map((p) => ({ ...p, active: p.id === plan.id })));
      void fetch('/api/coach/weekly-call/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: plan.client_id }),
      });
    }
    setActionLoading(false);
  };

  const handleDeactivate = async () => {
    if (!plan) return;
    setActionLoading(true);
    setError('');
    const { error: deactivateError } = await deactivatePlan(supabase, plan);
    if (deactivateError) setError(deactivateError);
    else {
      setSuccess('Plan deactivated.');
      setPlan({ ...plan, active: false });
      setHistory((h) => h.map((p) => (p.id === plan.id ? { ...p, active: false } : p)));
    }
    setActionLoading(false);
  };

  const handleDuplicate = async () => {
    if (!plan) return;
    setActionLoading(true);
    setError('');

    const version = await getNextPlanVersion(supabase, plan.client_id);
    const now = new Date().toISOString();

    const { data: duplicated, error: dupError } = await supabase
      .from('plans')
      .insert({
        client_id: plan.client_id,
        coach_id: plan.coach_id,
        title: `${plan.title} (copy)`,
        phase: plan.phase,
        workout_plan: plan.workout_plan,
        nutrition_plan: plan.nutrition_plan,
        cardio_plan: plan.cardio_plan,
        supplement_plan: plan.supplement_plan,
        coach_notes: plan.coach_notes,
        version,
        active: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (dupError || !duplicated) {
      setError(dupError?.message ?? 'Failed to duplicate plan.');
      setActionLoading(false);
      return;
    }

    router.push(`/coach/plan/${duplicated.id}`);
  };

  if (loading) {
    return <CoachShell narrow loading><span /></CoachShell>;
  }

  if (error && !plan) {
    return (
      <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <div style={styles.errorBox}>{error}</div>
      </CoachShell>
    );
  }

  if (!plan || !form) {
    return (
      <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <div style={styles.errorBox}>Unable to load plan data.</div>
      </CoachShell>
    );
  }

  return (
    <CoachShell narrow>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>

        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>{plan.title}</h1>
            <p style={styles.subtitle}>
              {plan.profiles?.name || plan.profiles?.email || 'Client'} · v{plan.version}
              {plan.phase ? ` · ${plan.phase}` : ''}
            </p>
            <p style={styles.meta}>Updated {formatPlanDate(plan.updated_at)}</p>
          </div>
          <span style={plan.active ? styles.badgeActive : styles.badgeInactive}>
            {plan.active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        {highFluxFlags.length > 0 && (
          <div style={styles.reviewBox}>
            <p style={styles.reviewTitle}>High-flux review</p>
            <ul style={styles.reviewList}>
              {highFluxFlags.map((flag, index) => (
                <li
                  key={index}
                  style={flag.level === 'warning' ? styles.reviewWarning : styles.reviewInfo}
                >
                  {flag.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={styles.actions}>
          {plan.active ? (
            <button type="button" onClick={handleDeactivate} disabled={actionLoading} style={styles.secondaryBtn}>
              Deactivate
            </button>
          ) : (
            <button type="button" onClick={handleActivate} disabled={actionLoading} style={styles.primaryBtn}>
              Deliver to client
            </button>
          )}
          <button type="button" onClick={handleDuplicate} disabled={actionLoading} style={styles.secondaryBtn}>
            Duplicate
          </button>
        </div>

        <form onSubmit={handleSave} style={styles.form}>
          {isDraftForReview && form && (
            <PlanDraftReviewActions
              clientId={form.client_id}
              form={form}
              onFormPatch={handleFormPatch}
              initialAction={reviewAction}
              onInitialActionConsumed={clearReviewQueryParams}
            />
          )}
          <PlanEditor
            form={form}
            onChange={handleChange}
            onFormPatch={handleFormPatch}
            clientLocked
            enableAiEdit
            initialAiSection={autoOpenAiSection}
            onInitialAiSectionConsumed={() => setAutoOpenAiSection(null)}
          />
          <button type="submit" disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>

        <section style={styles.history}>
          <h2 style={styles.historyTitle}>Version history</h2>
          <PlanVersionHistory plans={history} currentPlanId={plan.id} coachName={coachName} />
        </section>
    </CoachShell>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  container: coachPageStyles.containerNarrow,
  backLink: coachPageStyles.backLink,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  title: coachPageStyles.title,
  subtitle: coachPageStyles.subtitle,
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  badgeActive: { backgroundColor: colors.successMuted, color: colors.success, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeInactive: { backgroundColor: colors.bgElevated, color: colors.textMuted, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  primaryBtn: coachPageStyles.primaryBtn,
  secondaryBtn: coachPageStyles.secondaryBtn,
  form: coachPageStyles.card,
  saveBtn: { ...coachPageStyles.primaryBtn, marginTop: 16, width: '100%' },
  history: coachPageStyles.card,
  historyTitle: { margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary },
  historyEmpty: { color: colors.textMuted, margin: 0 },
  historyList: { display: 'flex', flexDirection: 'column', gap: 8 },
  historyItem: { ...coachPageStyles.listItem, cursor: 'pointer', textAlign: 'left', width: '100%' },
  historyItemCurrent: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  errorBox: { ...coachPageStyles.card, borderColor: colors.danger, marginTop: 20 },
  reviewBox: {
    ...coachPageStyles.card,
    borderColor: colors.accent,
    marginBottom: 20,
    backgroundColor: colors.bgElevated,
  },
  reviewTitle: { margin: '0 0 8px 0', fontSize: 14, fontWeight: 700, color: colors.textPrimary },
  reviewList: { margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 },
  reviewWarning: { color: colors.danger, fontSize: 13, lineHeight: 1.45 },
  reviewInfo: { color: colors.textMuted, fontSize: 13, lineHeight: 1.45 },
};
