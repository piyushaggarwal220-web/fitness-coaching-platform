'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CoachNavbar from '../../../components/CoachNavbar';
import { PlanEditor } from '@/components/PlanEditor';
import { activatePlan, getNextPlanVersion, INITIAL_PLAN_FORM, validatePlanForm } from '@/lib/plans';
import type { ClientProfile, Coach, PlanFormData } from '@/types/database';

type ClientOption = Pick<ClientProfile, 'id' | 'name' | 'email' | 'coach_id'>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function CoachNewPlanPage() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [form, setForm] = useState<PlanFormData>(INITIAL_PLAN_FORM);
  const [activateOnCreate, setActivateOnCreate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/coach/login');
        return;
      }

      const { data: coachData, error: coachError } = await supabase
        .from('coaches')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (coachError || !coachData) {
        router.push('/dashboard');
        return;
      }

      setCoach(coachData);

      const { data: clientsData } = await supabase
        .from('profiles')
        .select('id, name, email, coach_id')
        .eq('coach_id', coachData.id)
        .order('name');

      setClients(clientsData ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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

    if (activateOnCreate) {
      const { error: activateError } = await activatePlan(supabase, created);
      if (activateError) {
        setError('Plan created but activation failed: ' + activateError);
        setSubmitting(false);
        return;
      }
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

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
        <h1 style={styles.title}>Create new plan</h1>

        {clients.length === 0 && (
          <div style={styles.warning}>No assigned clients. Assign clients before creating plans.</div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <PlanEditor form={form} onChange={handleChange} clients={clients} />

          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={activateOnCreate}
              onChange={(e) => setActivateOnCreate(e.target.checked)}
            />
            Activate plan immediately (deactivates other plans for this client)
          </label>

          <button type="submit" disabled={submitting || clients.length === 0} style={styles.submitBtn}>
            {submitting ? 'Creating...' : 'Create plan'}
          </button>
        </form>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 800, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 16, fontWeight: 600 },
  title: { margin: '0 0 24px 0', fontSize: 28 },
  form: { backgroundColor: 'white', padding: 28, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  checkbox: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 14, color: '#444' },
  submitBtn: { marginTop: 20, width: '100%', padding: 14, backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', fontWeight: 600 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  warning: { backgroundColor: '#fff3cd', color: '#856404', padding: 12, borderRadius: 8, marginBottom: 16 },
};
