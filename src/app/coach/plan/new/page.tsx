'use client';

import { Suspense, useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import CoachNavbar from '../../../components/CoachNavbar';
import { PlanEditor } from '@/components/PlanEditor';
import { activatePlan, getNextPlanVersion, INITIAL_PLAN_FORM, validatePlanForm } from '@/lib/plans';
import { clearPlanDraftFromSession, loadPlanDraftFromSession } from '@/lib/ai/plan-format';
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

  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState<PlanFormData>(INITIAL_PLAN_FORM);
  const [aiDraftLoaded, setAiDraftLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
      }

      setForm(nextForm);
      setLoading(false);
    };
    load();
  }, [router, clientIdParam, fromAi]);

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
        coach_notes: form.coach_notes.trim() || null,
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
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading...</div>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
          <div style={styles.errorBox}>
            <p>{loadError}</p>
            <button style={styles.retryBtn} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <h1 style={styles.title}>{aiDraftLoaded ? 'Review AI plan draft' : 'Create new plan'}</h1>

        {aiDraftLoaded && (
          <div style={styles.aiBanner}>
            AI-generated draft loaded. Edit any section, then save as draft or deliver to the client.
          </div>
        )}

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
      </div>
    </>
  );
}

export default function CoachNewPlanPage() {
  return (
    <Suspense fallback={
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading...</div>
      </>
    }>
      <CoachNewPlanForm />
    </Suspense>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 800, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 16, fontWeight: 600 },
  title: { margin: '0 0 24px 0', fontSize: 28 },
  form: { backgroundColor: 'white', padding: 28, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  primaryBtn: { flex: 1, minWidth: 160, padding: 14, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 },
  secondaryBtn: { flex: 1, minWidth: 160, padding: 14, backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  warning: { backgroundColor: '#fff3cd', color: '#856404', padding: 12, borderRadius: 8, marginBottom: 16 },
  aiBanner: { backgroundColor: '#e7f3ff', color: '#004085', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  errorBox: { backgroundColor: '#f8d7da', color: '#721c24', padding: 24, borderRadius: 12, textAlign: 'center' },
  retryBtn: { padding: '10px 20px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, marginTop: 12 },
};
