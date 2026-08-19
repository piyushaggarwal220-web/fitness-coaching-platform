'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { brandTitle } from '@/lib/brand';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/coach-theme';
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
  const [clients, setClients] = useState<{ id: string; name: string | null; email: string | null; checkin_schedule_started_at: string | null }[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backfillMsg, setBackfillMsg] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const autoBackfillStarted = useRef(false);

  useEffect(() => {
    const load = async () => {
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const [{ data: checkinData, error: checkinsError }, { data: clientsData }] = await Promise.all([
        supabase
          .from('checkins')
          .select('id, client_id, coach_id, submitted_at, checkin_type, coaching_week, coaching_day, due_at, reviewed, reviewed_at, profiles:client_id(name, email)')
          .eq('coach_id', coachData.id)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, name, email, checkin_schedule_started_at')
          .eq('coach_id', coachData.id),
      ]);

      if (checkinsError) {
        setError('Failed to load check-ins.');
        setLoading(false);
        return;
      }

      setCheckins((checkinData as unknown as CheckinWithClient[]) ?? []);
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
    pendingMidWeek: queue.filter(
      (i) => i.status === 'pending_review' && i.type === 'mid_week' && i.checkinId
    ).length,
  }), [queue]);

  const runMidWeekBackfill = async (opts?: { force?: boolean }) => {
    const force = Boolean(opts?.force)
    setBackfilling(true)
    setBackfillMsg('')
    setError('')
    try {
      const res = await fetch('/api/coach/midweek-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfill: true, force, limit: 50 }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        total?: number
        generated?: number
        skipped?: number
        failed?: { checkinId: string; error: string }[]
        error?: string
      } | null
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Could not generate mid week replies')
        return
      }
      const failCount = data.failed?.length ?? 0
      setBackfillMsg(
        force
          ? `Short human replies refreshed: ${data.generated ?? 0} updated` +
              (failCount ? `, ${failCount} failed` : '') +
              `. Open a Day 3 check in and tap Send to client now.`
          : `Ready to send: ${data.generated ?? 0} new replies, ${data.skipped ?? 0} already drafted` +
              (failCount ? `, ${failCount} failed` : '') +
              `. Open a Day 3 check in and tap Send to client now.`
      )
    } catch {
      setError('Could not generate mid week replies')
    } finally {
      setBackfilling(false)
    }
  }

  // After clients submit (including ones already waiting), draft AI replies in the background.
  useEffect(() => {
    if (loading || autoBackfillStarted.current) return
    if (counts.pendingMidWeek <= 0) return
    autoBackfillStarted.current = true
    void runMidWeekBackfill({ force: false })
  }, [loading, counts.pendingMidWeek])

  if (loading) {
    return <CoachShell loading />;
  }

  return (
    <CoachShell>
        <h1 style={styles.title}>{brandTitle('Check-ins')}</h1>
        <p style={styles.subtitle}>{coach?.name ? `${coach.name}'s queue` : 'Review client progress'}</p>

        {counts.pendingMidWeek > 0 && (
          <div style={localStyles.backfillBar}>
            <div>
              <strong style={{ color: colors.textPrimary }}>
                {counts.pendingMidWeek} mid week check in{counts.pendingMidWeek === 1 ? '' : 's'} awaiting reply
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                {backfilling
                  ? 'AI is drafting ready to send replies for submitted check ins…'
                  : 'AI drafts a coach style reply for each submitted Day 3 check in. Open one and tap Send to client now.'}
              </p>
            </div>
            <button
              type="button"
              style={styles.primaryBtn}
              disabled={backfilling}
              onClick={() => void runMidWeekBackfill({ force: true })}
            >
              {backfilling ? 'Generating…' : 'Refresh mid week replies'}
            </button>
          </div>
        )}

        {backfillMsg && <div style={styles.success}>{backfillMsg}</div>}

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
    item.type === 'mid_week' ? 'AI reply ready' :
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
  backfillBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    background: colors.accentMuted,
    border: `1px solid ${colors.borderSubtle}`,
  },
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

