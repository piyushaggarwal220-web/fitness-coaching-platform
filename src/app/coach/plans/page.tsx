'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import CoachNavbar from '../../components/CoachNavbar';
import { formatPlanDate } from '@/lib/plans';
import type { Coach, PlanWithClient } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type StatusFilter = 'all' | 'active' | 'inactive';

export default function CoachPlansPage() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [plans, setPlans] = useState<PlanWithClient[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
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

      const { data, error: plansError } = await supabase
        .from('plans')
        .select('*, profiles:client_id(name, email)')
        .eq('coach_id', coachData.id)
        .order('updated_at', { ascending: false });

      if (plansError) {
        setError('Failed to load plans.');
        setLoading(false);
        return;
      }

      setPlans((data as PlanWithClient[]) ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    plans.forEach((p) => {
      map.set(p.client_id, p.profiles?.name || p.profiles?.email || p.client_id);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [plans]);

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      const matchesClient = !clientFilter || p.client_id === clientFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.active) ||
        (statusFilter === 'inactive' && !p.active);
      return matchesClient && matchesStatus;
    });
  }, [plans, clientFilter, statusFilter]);

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading plans...</div>
      </>
    );
  }

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>Coaching Plans</h1>
            <p style={styles.subtitle}>{coach?.name ? `${coach.name}'s plans` : 'Manage client plans'}</p>
          </div>
          <button style={styles.createBtn} onClick={() => router.push('/coach/plan/new')}>
            + New plan
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.toolbar}>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={styles.select}>
            <option value="">All clients</option>
            {clients.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={styles.select}>
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <div style={styles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No plans found</p>
              <p style={styles.emptyText}>Create a plan for an assigned client to get started.</p>
            </div>
          ) : (
            filtered.map((plan) => (
              <button
                key={plan.id}
                type="button"
                style={styles.card}
                onClick={() => router.push(`/coach/plan/${plan.id}`)}
              >
                <div>
                  <div style={styles.planTitle}>{plan.title}</div>
                  <div style={styles.meta}>
                    {plan.profiles?.name || plan.profiles?.email || 'Client'} · v{plan.version}
                    {plan.phase ? ` · ${plan.phase}` : ''}
                  </div>
                  <div style={styles.meta}>Updated {formatPlanDate(plan.updated_at)}</div>
                </div>
                <span style={plan.active ? styles.badgeActive : styles.badgeInactive}>
                  {plan.active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 960, margin: '0 auto', padding: '30px 20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6 },
  createBtn: { padding: '12px 20px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  select: { padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, minWidth: 180 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    backgroundColor: 'white',
    border: '1px solid #eee',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    flexWrap: 'wrap',
  },
  planTitle: { fontWeight: 600, fontSize: 16, marginBottom: 4 },
  meta: { fontSize: 14, color: '#666' },
  badgeActive: { backgroundColor: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  badgeInactive: { backgroundColor: '#e2e3e5', color: '#383d41', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  empty: { textAlign: 'center', padding: '48px 20px', backgroundColor: 'white', borderRadius: 12 },
  emptyTitle: { fontWeight: 600, fontSize: 18, marginBottom: 8 },
  emptyText: { color: '#666', margin: 0 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
};
