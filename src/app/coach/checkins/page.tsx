'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/design-tokens';
import { requireCoach } from '@/lib/coach-session';
import { formatCheckinDate } from '@/lib/checkin';
import { getCheckinTypeLabel, getCoachCheckinQueue, type CoachCheckinQueueItem } from '@/lib/checkin-schedule';
import type { Checkin, CheckinWithClient, Coach } from '@/types/database';

const supabase = createClient();

type Tab = 'pending' | 'completed' | 'missed' | 'due_today';
type TypeFilter = 'all' | 'mid_week' | 'weekly';

export default function CoachCheckinsPage() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [checkins, setCheckins] = useState<CheckinWithClient[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string | null; email: string | null; onboarding_completed_at: string | null }[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const [{ data: checkinData, error: checkinsError }, { data: clientsData }] = await Promise.all([
        supabase
          .from('checkins')
          .select('*, profiles:client_id(name, email)')
          .eq('coach_id', coachData.id)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, name, email, onboarding_completed_at')
          .eq('coach_id', coachData.id),
      ]);

      if (checkinsError) {
        setError('Failed to load check-ins.');
        setLoading(false);
        return;
      }

      setCheckins((checkinData as CheckinWithClient[]) ?? []);
      setClients(clientsData ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const queue = useMemo(() => {
    return getCoachCheckinQueue(clients, checkins as Checkin[]);
  }, [clients, checkins]);

  const clientOptions = useMemo(() => {
    const names = new Map<string, string>();
    clients.forEach((c) => names.set(c.id, c.name || c.email || c.id));
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clients]);

  const filtered = useMemo(() => {
    return queue.filter((item) => {
      const matchesTab =
        (tab === 'pending' && item.status === 'pending_review') ||
        (tab === 'completed' && item.status === 'completed') ||
        (tab === 'missed' && item.status === 'missed') ||
        (tab === 'due_today' && item.status === 'due_today');
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const matchesClient = !clientFilter || item.clientId === clientFilter;
      return matchesTab && matchesType && matchesClient;
    });
  }, [queue, tab, typeFilter, clientFilter]);

  const counts = useMemo(() => ({
    pending: queue.filter((i) => i.status === 'pending_review').length,
    completed: queue.filter((i) => i.status === 'completed').length,
    missed: queue.filter((i) => i.status === 'missed').length,
    dueToday: queue.filter((i) => i.status === 'due_today').length,
  }), [queue]);

  if (loading) {
    return <CoachShell loading />;
  }

  return (
    <CoachShell>
        <h1 style={styles.title}>Check-ins</h1>
        <p style={styles.subtitle}>{coach?.name ? `${coach.name}'s queue` : 'Review client progress'}</p>

        {error && (
          <div style={styles.error}>
            <p style={{ margin: '0 0 8px' }}>{error}</p>
            <button style={styles.primaryBtn} onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}

        <div style={{ ...styles.toolbar, justifyContent: 'space-between' }}>
          <div style={styles.tabs}>
            <TabButton active={tab === 'pending'} onClick={() => setTab('pending')} label={`Pending (${counts.pending})`} />
            <TabButton active={tab === 'due_today'} onClick={() => setTab('due_today')} label={`Due today (${counts.dueToday})`} />
            <TabButton active={tab === 'completed'} onClick={() => setTab('completed')} label={`Completed (${counts.completed})`} />
            <TabButton active={tab === 'missed'} onClick={() => setTab('missed')} label={`Missed (${counts.missed})`} />
          </div>
          <div style={localStyles.filters}>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} style={styles.select}>
              <option value="all">All types</option>
              <option value="mid_week">Day 3</option>
              <option value="weekly">Weekly (Day 7)</option>
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={styles.select}>
              <option value="">All clients</option>
              {clientOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={localStyles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No {tab.replace('_', ' ')} check-ins</p>
              <p style={styles.emptyText}>Check-ins will appear here as clients progress through their coaching weeks.</p>
            </div>
          ) : (
            filtered.map((item) => (
              <QueueCard key={`${item.clientId}-${item.type}-${item.coachingWeek}`} item={item} onOpen={(id) => router.push(`/coach/checkin/${id}`)} />
            ))
          )}
        </div>
    </CoachShell>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }} onClick={onClick}>
      {label}
    </button>
  );
}

function QueueCard({ item, onOpen }: { item: CoachCheckinQueueItem; onOpen: (id: string) => void }) {
  const badgeStyle =
    item.status === 'completed' ? localStyles.badgeReviewed :
    item.status === 'missed' ? localStyles.badgeMissed :
    item.status === 'due_today' ? localStyles.badgeDue :
    localStyles.badgePending;

  const badgeLabel =
    item.status === 'completed' ? 'Completed' :
    item.status === 'missed' ? 'Missed' :
    item.status === 'due_today' ? 'Due today' :
    'Pending review';

  const content = (
    <>
      <div>
        <div style={localStyles.clientName}>{item.clientName}</div>
        <div style={localStyles.meta}>
          {getCheckinTypeLabel(item.type)} · Week {item.coachingWeek} · Day {item.coachingDay}
          {item.submittedAt ? ` · ${formatCheckinDate(item.submittedAt)}` : ` · Due ${formatCheckinDate(item.dueDate.toISOString())}`}
        </div>
      </div>
      <span style={badgeStyle}>{badgeLabel}</span>
    </>
  );

  if (item.checkinId) {
    return (
      <button type="button" style={localStyles.cardBtn} onClick={() => onOpen(item.checkinId!)}>
        {content}
      </button>
    );
  }

  return <div style={localStyles.cardStatic}>{content}</div>;
}

const localStyles: Record<string, CSSProperties> = {
  filters: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  list: { display: 'flex', flexDirection: 'column', gap: 0 },
  cardBtn: { ...styles.listItem, cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none', font: 'inherit' },
  cardStatic: { ...styles.listItem, cursor: 'default' },
  clientName: { fontWeight: 600, fontSize: 16, marginBottom: 4, color: colors.textPrimary },
  meta: { fontSize: 14, color: colors.textSecondary },
  badgePending: { ...styles.badge, backgroundColor: colors.warningMuted, color: colors.warning },
  badgeReviewed: { ...styles.badge, backgroundColor: colors.successMuted, color: colors.success },
  badgeMissed: { ...styles.badge, backgroundColor: colors.dangerMuted, color: colors.danger },
  badgeDue: { ...styles.badge, backgroundColor: colors.accentMuted, color: colors.accent },
};
