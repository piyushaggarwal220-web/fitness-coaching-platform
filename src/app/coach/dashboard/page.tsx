'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { createClient } from '@/lib/supabase/client';
import { requireCoach } from '@/lib/coach-session';
import { colors } from '@/lib/design-tokens';
import type { ClientProfile, Coach, CoachStats } from '@/types/database';

const supabase = createClient();

export default function CoachDashboard() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<CoachStats>({ total: 0, awaiting: 0, overdue: 0, new: 0 });
  const [pendingCheckins, setPendingCheckins] = useState(0);
  const [plansDelivered, setPlansDelivered] = useState(0);

  useEffect(() => {
    const checkCoach = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('coach_id', coachData.id);

      if (clientsError) {
        setError('Failed to load dashboard data. Please try again.');
        setLoading(false);
        return;
      }

      if (clientsData) {
        setClients(clientsData);
        const total = clientsData.length;
        const awaiting = clientsData.filter(c => c.checkin_awaiting === true).length;
        const overdue = clientsData.filter(c => c.checkin_overdue === true).length;
        const newClients = clientsData.filter(c => c.plan_delivered === false).length;
        setStats({ total, awaiting, overdue, new: newClients });
      }

      const { count, error: checkinsError } = await supabase
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('reviewed', false);

      if (checkinsError) {
        setError('Failed to load check-in counts.');
        setLoading(false);
        return;
      }

      setPendingCheckins(count ?? 0);

      const { count: activePlanCount, error: plansError } = await supabase
        .from('plans')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('active', true);

      if (plansError) {
        setError('Failed to load plan counts.');
        setLoading(false);
        return;
      }

      setPlansDelivered(activePlanCount ?? 0);
      setLoading(false);
    };
    checkCoach();
  }, [router]);

  if (loading) {
    return <CoachShell loading><span /></CoachShell>;
  }

  if (error) {
    return (
      <CoachShell>
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryBtn} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
        <div style={styles.header}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' }}>Coach Dashboard</h1>
          <p style={styles.subtitle}>Welcome back, {coach?.name || 'Coach'}!</p>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.total}</div>
            <div style={styles.statLabel}>Total Clients</div>
            <div style={styles.statSub}>{stats.total}/{coach?.hard_cap || 500} capacity</div>
          </div>
          <div style={{...styles.statCard, borderColor: colors.warning}}>
            <div style={styles.statNumber}>{stats.awaiting}</div>
            <div style={styles.statLabel}>Awaiting Response</div>
          </div>
          <div style={{...styles.statCard, borderColor: colors.danger}}>
            <div style={styles.statNumber}>{stats.overdue}</div>
            <div style={styles.statLabel}>Overdue Check-ins</div>
          </div>
          <div style={{...styles.statCard, borderColor: colors.accent}}>
            <div style={styles.statNumber}>{stats.new}</div>
            <div style={styles.statLabel}>New Clients</div>
          </div>
        </div>

        <div style={styles.statsGrid}>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard }} onClick={() => router.push('/coach/clients?tier=low')}>
            <div style={{ ...styles.statNumber, color: colors.success }}>{clients.filter((c) => c.complexity_tier === 'low').length}</div>
            <div style={styles.statLabel}>Low Complexity</div>
          </button>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard }} onClick={() => router.push('/coach/clients?tier=medium')}>
            <div style={{ ...styles.statNumber, color: colors.warning }}>{clients.filter((c) => c.complexity_tier === 'medium').length}</div>
            <div style={styles.statLabel}>Medium Complexity</div>
          </button>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard }} onClick={() => router.push('/coach/clients?tier=high')}>
            <div style={{ ...styles.statNumber, color: colors.danger }}>{clients.filter((c) => c.complexity_tier === 'high').length}</div>
            <div style={styles.statLabel}>High Complexity</div>
          </button>
        </div>

        <div style={styles.checkinBanner}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>Pending check-in reviews</h2>
            <p style={{ margin: '6px 0 0 0', color: colors.textSecondary }}>
              {pendingCheckins === 0 ? 'All caught up!' : `${pendingCheckins} check-in${pendingCheckins === 1 ? '' : 's'} waiting for review`}
            </p>
          </div>
          <button style={styles.checkinBtn} onClick={() => router.push('/coach/checkins')}>
            Review check-ins
          </button>
        </div>

        <div style={styles.checkinBanner}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>Active plans delivered</h2>
            <p style={{ margin: '6px 0 0 0', color: colors.textSecondary }}>
              {plansDelivered} client{plansDelivered === 1 ? '' : 's'} with an active plan
            </p>
          </div>
          <button style={styles.checkinBtn} onClick={() => router.push('/coach/plans')}>
            Manage plans
          </button>
        </div>

        <div style={styles.queueSection}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>Client Queue</h2>

          <div style={styles.clientList}>
            {clients.length === 0 ? (
              <p style={styles.empty}>No clients assigned yet.</p>
            ) : (
              clients.map((client) => (
                <div key={client.id} style={styles.clientCard}>
                  <div style={styles.clientInfo}>
                    <div style={styles.clientName}>{client.name || client.email}</div>
                    <div style={styles.clientStatus}>
                      {client.complexity_score != null && client.complexity_tier && (
                        <span style={{
                          backgroundColor: client.complexity_tier === 'low' ? colors.successMuted : client.complexity_tier === 'medium' ? colors.warningMuted : colors.dangerMuted,
                          color: client.complexity_tier === 'low' ? colors.success : client.complexity_tier === 'medium' ? colors.warning : colors.danger,
                          padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        }}>
                          {client.complexity_score}/100
                        </span>
                      )}
                      {client.checkin_overdue && <span style={styles.badgeOverdue}>Overdue</span>}
                      {client.checkin_awaiting && <span style={styles.badgeAwaiting}>Awaiting</span>}
                      {!client.plan_delivered && <span style={styles.badgeNew}>New</span>}
                      {!client.checkin_overdue && !client.checkin_awaiting && client.plan_delivered &&
                        <span style={styles.badgeOk}>✓ OK</span>
                      }
                    </div>
                  </div>
                  <div style={styles.clientActions}>
                    <button style={styles.actionBtn} onClick={() => router.push(`/coach/client/${client.id}`)}>
                      View Profile
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </CoachShell>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  header: { marginBottom: 24 },
  subtitle: { color: colors.textSecondary, margin: '4px 0 0' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 },
  statCard: { backgroundColor: colors.bgCard, padding: 20, borderRadius: 16, border: `1px solid ${colors.borderSubtle}` },
  complexityCard: { cursor: 'pointer', textAlign: 'left', width: '100%' },
  statNumber: { fontSize: 32, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: 500 },
  statSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  queueSection: { backgroundColor: colors.bgCard, padding: 24, borderRadius: 16, border: `1px solid ${colors.borderSubtle}` },
  clientList: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 },
  clientCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, backgroundColor: colors.bgElevated },
  clientInfo: { flex: 1 },
  clientName: { fontWeight: 600, marginBottom: 4, color: colors.textPrimary },
  clientStatus: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badgeOverdue: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeAwaiting: { backgroundColor: colors.warningMuted, color: colors.warning, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeNew: { backgroundColor: colors.accentMuted, color: colors.accent, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeOk: { backgroundColor: colors.successMuted, color: colors.success, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  clientActions: { display: 'flex', gap: 10 },
  actionBtn: { padding: '10px 16px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14, minHeight: 44 },
  empty: { textAlign: 'center', color: colors.textMuted, padding: '40px 0' },
  checkinBanner: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
    backgroundColor: colors.bgCard, padding: 20, borderRadius: 16, marginBottom: 16,
    border: `1px solid ${colors.borderSubtle}`,
  },
  checkinBtn: { padding: '12px 20px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 600, minHeight: 48 },
  errorBox: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: 24, borderRadius: 16, textAlign: 'center', border: `1px solid rgba(239,68,68,0.2)` },
  errorText: { margin: '0 0 16px 0' },
  retryBtn: { padding: '12px 20px', backgroundColor: colors.bgElevated, color: colors.textPrimary, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, cursor: 'pointer', fontSize: 14, minHeight: 48 },
};
