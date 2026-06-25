'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import CoachNavbar from '../../../components/CoachNavbar';
import { PlanEditor } from '@/components/PlanEditor';
import {
  activatePlan,
  deactivatePlan,
  formatPlanDate,
  getNextPlanVersion,
  planToForm,
  validatePlanForm,
} from '@/lib/plans';
import type { Plan, PlanFormData, PlanWithClient } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function CoachPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const planId = typeof params.id === 'string' ? params.id : '';

  const [plan, setPlan] = useState<PlanWithClient | null>(null);
  const [history, setHistory] = useState<Plan[]>([]);
  const [form, setForm] = useState<PlanFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!planId) {
      setError('Invalid plan ID.');
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/coach/login');
        return;
      }

      const { data: coachData } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!coachData) {
        router.push('/dashboard');
        return;
      }

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

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!form) return;
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

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

    const { error: updateError } = await supabase
      .from('plans')
      .update({
        title: form.title.trim(),
        phase: form.phase.trim() || null,
        workout_plan: form.workout_plan.trim() || null,
        nutrition_plan: form.nutrition_plan.trim() || null,
        cardio_plan: form.cardio_plan.trim() || null,
        supplement_plan: form.supplement_plan.trim() || null,
        coach_notes: form.coach_notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess('Plan saved.');
      setPlan({ ...plan, ...form, updated_at: new Date().toISOString() });
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
      setSuccess('Plan activated.');
      setPlan({ ...plan, active: true, delivered_at: new Date().toISOString() });
      setHistory((h) => h.map((p) => ({ ...p, active: p.id === plan.id })));
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
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading plan...</div>
      </>
    );
  }

  if (error && !plan) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href="/coach/plans" style={styles.backLink}>← Back to plans</Link>
          <div style={styles.errorBox}>{error}</div>
        </div>
      </>
    );
  }

  if (!plan || !form) return null;

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
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

        <div style={styles.actions}>
          {plan.active ? (
            <button type="button" onClick={handleDeactivate} disabled={actionLoading} style={styles.secondaryBtn}>
              Deactivate
            </button>
          ) : (
            <button type="button" onClick={handleActivate} disabled={actionLoading} style={styles.primaryBtn}>
              Activate plan
            </button>
          )}
          <button type="button" onClick={handleDuplicate} disabled={actionLoading} style={styles.secondaryBtn}>
            Duplicate
          </button>
        </div>

        <form onSubmit={handleSave} style={styles.form}>
          <PlanEditor form={form} onChange={handleChange} clientLocked />
          <button type="submit" disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </form>

        <section style={styles.history}>
          <h2 style={styles.historyTitle}>Version history</h2>
          {history.length === 0 ? (
            <p style={styles.historyEmpty}>No other versions.</p>
          ) : (
            <div style={styles.historyList}>
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={{
                    ...styles.historyItem,
                    ...(item.id === plan.id ? styles.historyItemCurrent : {}),
                  }}
                  onClick={() => item.id !== plan.id && router.push(`/coach/plan/${item.id}`)}
                >
                  <span>v{item.version} — {item.title}</span>
                  <span style={item.active ? styles.badgeActive : styles.badgeInactive}>
                    {item.active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 800, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 16, fontWeight: 600 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6 },
  meta: { color: '#999', fontSize: 13, marginTop: 4 },
  badgeActive: { backgroundColor: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  badgeInactive: { backgroundColor: '#e2e3e5', color: '#383d41', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  primaryBtn: { padding: '10px 18px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' },
  secondaryBtn: { padding: '10px 18px', backgroundColor: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' },
  form: { backgroundColor: 'white', padding: 28, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: 24 },
  saveBtn: { marginTop: 16, width: '100%', padding: 14, backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' },
  history: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' },
  historyTitle: { margin: '0 0 16px 0', fontSize: 18 },
  historyEmpty: { color: '#666', margin: 0 },
  historyList: { display: 'flex', flexDirection: 'column', gap: 8 },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    border: '1px solid #eee',
    borderRadius: 8,
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  },
  historyItemCurrent: { borderColor: '#e94560', backgroundColor: '#fff5f6' },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  success: { backgroundColor: '#d4edda', color: '#155724', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorBox: { backgroundColor: '#f8d7da', color: '#721c24', padding: 24, borderRadius: 12, marginTop: 20 },
};
