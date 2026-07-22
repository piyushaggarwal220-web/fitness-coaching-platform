'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { CoachSectionHeader } from '@/components/coach/CoachSectionHeader';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { createClient } from '@/lib/supabase/client';
import { requireCoach } from '@/lib/coach-session';
import { brandTitle } from '@/lib/brand';
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore';
import { colors, spacing } from '@/lib/design-tokens';
import { CoachConversationsSection } from '@/components/chat/CoachConversationsSection';
import { CoachWorkQueuePanel } from '@/components/coach/CoachWorkQueuePanel';
import { CoachWorkSummaryCards } from '@/components/coach/CoachWorkSummaryCards';
import { CoachTrackerAdherencePanel } from '@/components/coach/CoachTrackerAdherencePanel';
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation';
import type { WorkQueueCounts, WorkQueueFilter } from '@/lib/coach-work-queue';
import { getCoachClientCheckinSummary, getCheckinStatusLabel, getCheckinTypeDisplayName } from '@/lib/checkin-schedule';
import type { Checkin, ClientProfile, Coach, CoachStats } from '@/types/database';

type CoachClientRow = ClientProfile;
const supabase = createClient();

function clientPriority(client: CoachClientRow): number {
  if (client.checkin_overdue) return 0;
  if (client.checkin_awaiting) return 1;
  if (!client.plan_delivered) return 2;
  return 3;
}

export default function CoachDashboard() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<CoachClientRow[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringSession, setRestoringSession] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<CoachStats>({ total: 0, awaiting: 0, overdue: 0, new: 0 });
  const [pendingCheckins, setPendingCheckins] = useState(0);
  const [plansDelivered, setPlansDelivered] = useState(0);
  const [queueFilter, setQueueFilter] = useState<WorkQueueFilter>('all');
  const [queueCounts, setQueueCounts] = useState<WorkQueueCounts | null>(null);

  const handleCountsChange = useCallback((counts: WorkQueueCounts) => {
    setQueueCounts(counts);
  }, []);

  const sortedClients = useMemo(() => {
    return [...clients].sort((a, b) => {
      const byPriority = clientPriority(a) - clientPriority(b);
      if (byPriority !== 0) return byPriority;
      const nameA = (a.name || a.email || '').toLowerCase();
      const nameB = (b.name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [clients]);

  useEffect(() => {
    const checkCoach = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      setRestoringSession(false);
      if (!coachData) {
        setError((prev) => prev || 'Could not restore your session. Please refresh or sign in again.');
        setLoading(false);
        return;
      }

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('id, name, email, plan_delivered, checkin_awaiting, checkin_overdue, checkin_schedule_started_at, complexity_score, complexity_tier')
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

        const clientIds = clientsData.map((c) => c.id);
        if (clientIds.length > 0) {
          const { data: checkinData } = await supabase
            .from('checkins')
            .select('id, client_id, checkin_type, coaching_week, coaching_day, reviewed, submitted_at')
            .in('client_id', clientIds);
          setCheckins((checkinData ?? []) as Checkin[]);
        }
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
    return (
      <CoachShell loading loadingMessage={restoringSession ? SESSION_RESTORE_MESSAGE : undefined}>
        <span />
      </CoachShell>
    );
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

  const firstName = coach?.name?.split(' ')[0] || 'Coach';

  return (
    <CoachShell>
      {/* Greeting */}
      <div style={styles.header}>
        <p style={styles.eyebrow}>Coach home</p>
        <h1 style={coachPageStyles.title}>{brandTitle("Today's Work")}</h1>
        <p style={{ ...coachPageStyles.subtitle, marginBottom: 0 }}>
          Welcome back, {firstName}. Here&apos;s your coaching overview, sorted by what needs attention first.
        </p>
      </div>

      <NotificationActivationGate audience="coach" />

      {/* Overview */}
      <section style={coachPageStyles.section}>
        <CoachSectionHeader title="Overview" subtitle="Client load and check-in pressure" />
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.total}</div>
            <div style={styles.statLabel}>Total Clients</div>
            <div style={styles.statSub}>{stats.total}/{coach?.hard_cap || 500} capacity</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: colors.warning }}>
            <div style={styles.statNumber}>{stats.awaiting}</div>
            <div style={styles.statLabel}>Awaiting Response</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: colors.danger }}>
            <div style={styles.statNumber}>{stats.overdue}</div>
            <div style={styles.statLabel}>Overdue Check-ins</div>
          </div>
          <div style={{ ...styles.statCard, borderColor: colors.accent }}>
            <div style={styles.statNumber}>{stats.new}</div>
            <div style={styles.statLabel}>New Clients</div>
          </div>
        </div>
        <div style={{ ...styles.statsGrid, marginBottom: 0 }}>
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
      </section>

      {/* Work queue — primary action */}
      <section style={coachPageStyles.section}>
        <CoachSectionHeader
          title="Work queue"
          subtitle="Start with the highest-priority task, then move down the list"
        />
        <CoachWorkSummaryCards
          counts={queueCounts}
          filter={queueFilter}
          onFilter={setQueueFilter}
        />
        <CoachWorkQueuePanel filter={queueFilter} onCountsChange={handleCountsChange} />
      </section>

      {/* Adherence */}
      <section style={coachPageStyles.section}>
        <CoachSectionHeader
          title="Tracker adherence"
          subtitle="Who needs a nudge based on the last 7 days"
        />
        <CoachTrackerAdherencePanel />
      </section>

      {/* Conversations */}
      <section style={coachPageStyles.section}>
        <CoachSectionHeader
          title="Conversations"
          subtitle="Unread messages and latest client activity"
          action={
            <button type="button" style={styles.checkinBtn} onClick={() => router.push('/coach/chat')}>
              All chats
            </button>
          }
        />
        <div style={styles.queueSection}>
          <CoachConversationsSection />
        </div>
      </section>

      {/* Shortcuts */}
      <section style={coachPageStyles.section}>
        <CoachSectionHeader title="Shortcuts" subtitle="Jump to common coaching tools" />
        <div style={styles.shortcutGrid}>
          <button type="button" style={styles.shortcutCard} onClick={() => router.push('/coach/checkins')}>
            <div style={styles.shortcutTitle}>Check-in reviews</div>
            <div style={styles.shortcutMeta}>
              {pendingCheckins === 0
                ? 'All caught up'
                : `${pendingCheckins} waiting for review`}
            </div>
          </button>
          <button type="button" style={styles.shortcutCard} onClick={() => router.push('/coach/plans')}>
            <div style={styles.shortcutTitle}>Active plans</div>
            <div style={styles.shortcutMeta}>
              {plansDelivered} client{plansDelivered === 1 ? '' : 's'} with an active plan
            </div>
          </button>
          <button type="button" style={styles.shortcutCard} onClick={() => router.push('/coach/clients')}>
            <div style={styles.shortcutTitle}>All clients</div>
            <div style={styles.shortcutMeta}>Browse and filter your roster</div>
          </button>
        </div>
      </section>

      {/* Client roster */}
      <section>
        <CoachSectionHeader
          title="Client roster"
          subtitle="Sorted by urgency — overdue and awaiting first"
          action={
            <button type="button" style={styles.secondaryBtn} onClick={() => router.push('/coach/clients')}>
              View all
            </button>
          }
        />
        <div style={styles.queueSection}>
          <div style={styles.clientList}>
            {sortedClients.length === 0 ? (
              <p style={styles.empty}>No clients assigned yet.</p>
            ) : (
              sortedClients.map((client) => {
                const summary = client.checkin_schedule_started_at
                  ? getCoachClientCheckinSummary(client.id, client.checkin_schedule_started_at, checkins)
                  : null;

                return (
                  <div key={client.id} style={styles.clientCard}>
                    <div style={styles.clientInfo}>
                      <div style={styles.clientName}>{client.name || client.email}</div>
                      {summary && (
                        <div style={styles.checkinMeta}>
                          <span>Week {summary.activeCoachingWeek}</span>
                          <span>·</span>
                          <span>
                            Next: {summary.nextCheckin ? getCheckinTypeDisplayName(summary.nextCheckin.type) : '—'}
                          </span>
                          <span>·</span>
                          <span>
                            {summary.countdownDetailed ?? (summary.nextCheckinStatus === 'available' ? 'Available today' : '—')}
                          </span>
                        </div>
                      )}
                      <div style={styles.clientStatus}>
                        {summary && (
                          <>
                            <span style={summary.midWeekStatus === 'completed' ? styles.badgeOk : summary.midWeekStatus === 'missed' ? styles.badgeOverdue : styles.badgeAwaiting}>
                              Mid: {getCheckinStatusLabel(summary.midWeekStatus)}
                            </span>
                            <span style={summary.weeklyStatus === 'completed' ? styles.badgeOk : summary.weeklyStatus === 'missed' ? styles.badgeOverdue : styles.badgeAwaiting}>
                              Weekly: {getCheckinStatusLabel(summary.weeklyStatus)}
                            </span>
                          </>
                        )}
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
                );
              })
            )}
          </div>
        </div>
      </section>
    </CoachShell>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  header: { marginBottom: spacing[6] },
  eyebrow: {
    margin: 0,
    fontSize: 13,
    color: colors.accent,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 },
  statCard: { backgroundColor: colors.bgCard, padding: 20, borderRadius: 16, border: `1px solid ${colors.borderSubtle}` },
  complexityCard: { cursor: 'pointer', textAlign: 'left', width: '100%' },
  statNumber: { fontSize: 32, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' },
  statLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: 500 },
  statSub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  queueSection: { backgroundColor: colors.bgCard, padding: 20, borderRadius: 16, border: `1px solid ${colors.borderSubtle}` },
  clientList: { display: 'flex', flexDirection: 'column', gap: 12 },
  clientCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, backgroundColor: colors.bgElevated, gap: 12, flexWrap: 'wrap' },
  clientInfo: { flex: 1, minWidth: 0 },
  clientName: { fontWeight: 700, marginBottom: 4, color: colors.textPrimary, fontSize: 16 },
  checkinMeta: { display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  clientStatus: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badgeOverdue: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeAwaiting: { backgroundColor: colors.warningMuted, color: colors.warning, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeNew: { backgroundColor: colors.accentMuted, color: colors.accent, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  badgeOk: { backgroundColor: colors.successMuted, color: colors.success, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  clientActions: { display: 'flex', gap: 10 },
  actionBtn: { padding: '10px 16px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 600, fontSize: 14, minHeight: 44 },
  empty: { textAlign: 'center', color: colors.textMuted, padding: '40px 0', margin: 0 },
  shortcutGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
  },
  shortcutCard: {
    textAlign: 'left',
    padding: 18,
    borderRadius: 16,
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgCard,
    cursor: 'pointer',
    color: 'inherit',
  },
  shortcutTitle: { fontWeight: 700, fontSize: 16, color: colors.textPrimary },
  shortcutMeta: { marginTop: 6, fontSize: 13, color: colors.textMuted, lineHeight: 1.4 },
  checkinBtn: { padding: '10px 16px', backgroundColor: colors.accent, color: colors.textInverse, border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44, flexShrink: 0 },
  secondaryBtn: { padding: '10px 16px', backgroundColor: colors.bgElevated, color: colors.textPrimary, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44, flexShrink: 0 },
  errorBox: { backgroundColor: colors.dangerMuted, color: colors.danger, padding: 24, borderRadius: 16, textAlign: 'center', border: `1px solid rgba(239,68,68,0.2)` },
  errorText: { margin: '0 0 16px 0' },
  retryBtn: { padding: '12px 20px', backgroundColor: colors.bgElevated, color: colors.textPrimary, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, cursor: 'pointer', fontSize: 14, minHeight: 48 },
};
