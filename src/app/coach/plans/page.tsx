'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { brandTitle } from '@/lib/brand';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/coach-theme';
import { requireCoach } from '@/lib/coach-session';
import { formatPlanDate } from '@/lib/plans';
import type { Coach, PlanWithClient } from '@/types/database';

const supabase = createClient();

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
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

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
    return <CoachShell loading />;
  }

  return (
    <CoachShell>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>{brandTitle('Coaching Plans')}</h1>
            <p style={styles.subtitle}>{coach?.name ? `${coach.name}'s plans` : 'Manage client plans'}</p>
          </div>
          <button style={styles.primaryBtn} onClick={() => router.push('/coach/plan/new')}>
            + New plan
          </button>
        </div>

        {error && (
          <div style={styles.error}>
            <p style={{ margin: '0 0 8px' }}>{error}</p>
            <button style={styles.primaryBtn} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

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

        <div style={localStyles.list}>
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
                style={localStyles.cardBtn}
                onClick={() => router.push(`/coach/plan/${plan.id}`)}
              >
                <div>
                  <div style={localStyles.planTitle}>{plan.title}</div>
                  <div style={localStyles.meta}>
                    {plan.profiles?.name || plan.profiles?.email || 'Client'} · v{plan.version}
                    {plan.phase ? ` · ${plan.phase}` : ''}
                  </div>
                  <div style={localStyles.meta}>Updated {formatPlanDate(plan.updated_at)}</div>
                </div>
                <span style={plan.active ? localStyles.badgeActive : localStyles.badgeInactive}>
                  {plan.active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))
          )}
        </div>
    </CoachShell>
  );
}

const localStyles: Record<string, CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 0 },
  cardBtn: { ...styles.listItem, cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none', font: 'inherit' },
  planTitle: { fontWeight: 600, fontSize: 16, marginBottom: 4, color: colors.textPrimary },
  meta: { fontSize: 14, color: colors.textSecondary },
  badgeActive: { ...styles.badge, backgroundColor: colors.successMuted, color: colors.success },
  badgeInactive: { ...styles.badge, backgroundColor: colors.bgElevated, color: colors.textMuted },
};
