'use client';

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { brandTitle } from '@/lib/brand';
import { coachPageStyles as styles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/design-tokens';
import { requireCoach } from '@/lib/coach-session';
import {
  coachBadgeStyles,
  formatFitnessGoal,
  getCheckinStatus,
  getPlanStatus,
} from '@/lib/coach-utils';
import { COMPLEXITY_TIER_COLORS, formatTierLabel } from '@/lib/complexity/display';
import { getCoachClientCheckinSummary, getCheckinStatusLabel, getCheckinTypeDisplayName } from '@/lib/checkin-schedule';
import type { Checkin, ClientProfile, Coach } from '@/types/database';

type CoachClientRow = ClientProfile;

type SortOption = 'name' | 'highest' | 'lowest' | 'improved' | 'increased' | 'newest';

const supabase = createClient();

export default function CoachClientsPage() {
  return (
    <Suspense fallback={<CoachShell loading><span /></CoachShell>}>
      <CoachClientsContent />
    </Suspense>
  );
}

function CoachClientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierFilter = (searchParams.get('tier') as 'low' | 'medium' | 'high' | null) ?? null;
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<CoachClientRow[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClients = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('id, name, email, fitness_goal, plan_delivered, checkin_awaiting, checkin_overdue, checkin_schedule_started_at, complexity_score, complexity_tier, complexity_score_change, complexity_last_calculated_at')
        .eq('coach_id', coachData.id)
        .order('name', { ascending: true });

      if (clientsError) {
        setError('Failed to load clients. Please try again.');
        setLoading(false);
        return;
      }

      setClients(clientsData ?? []);

      const clientIds = (clientsData ?? []).map((c) => c.id);
      if (clientIds.length > 0) {
        const { data: checkinData } = await supabase
          .from('checkins')
          .select('id, client_id, checkin_type, coaching_week, coaching_day, reviewed, submitted_at')
          .in('client_id', clientIds);
        setCheckins((checkinData ?? []) as Checkin[]);
      }

      setLoading(false);
    };

    loadClients();
  }, [router]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = clients;

    if (tierFilter) {
      list = list.filter((client) => client.complexity_tier === tierFilter);
    }

    if (query) {
      list = list.filter((client) => {
        const name = (client.name ?? '').toLowerCase();
        const email = (client.email ?? '').toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'highest':
          return (b.complexity_score ?? -1) - (a.complexity_score ?? -1);
        case 'lowest':
          return (a.complexity_score ?? 999) - (b.complexity_score ?? 999);
        case 'improved':
          return (a.complexity_score_change ?? 0) - (b.complexity_score_change ?? 0);
        case 'increased':
          return (b.complexity_score_change ?? 0) - (a.complexity_score_change ?? 0);
        case 'newest':
          return new Date(b.complexity_last_calculated_at ?? 0).getTime() -
            new Date(a.complexity_last_calculated_at ?? 0).getTime();
        default:
          return (a.name ?? '').localeCompare(b.name ?? '');
      }
    });

    return sorted;
  }, [clients, search, tierFilter, sortBy]);

  if (loading) {
    return <CoachShell loading />;
  }

  if (error) {
    return (
      <CoachShell>
        <div style={{ ...styles.card, textAlign: 'center', borderColor: colors.danger }}>
          <p style={{ margin: '0 0 16px', color: colors.danger }}>{error}</p>
          <button style={styles.primaryBtn} onClick={() => window.location.reload()}>Retry</button>
        </div>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>{brandTitle('Clients')}</h1>
            <p style={styles.subtitle}>
              {coach?.name ? `${coach.name}'s roster` : 'Your assigned clients'} · {clients.length} total
            </p>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            style={styles.select}
          >
            <option value="name">Sort: Name</option>
            <option value="highest">Highest Complexity</option>
            <option value="lowest">Lowest Complexity</option>
            <option value="improved">Largest Improvement</option>
            <option value="increased">Largest Increase</option>
            <option value="newest">Newest Changes</option>
          </select>
          {tierFilter && (
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={() => router.push('/coach/clients')}
            >
              Clear {formatTierLabel(tierFilter)} filter
            </button>
          )}
        </div>

        <div style={styles.card}>
          {clients.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No clients assigned yet</p>
              <p style={styles.emptyText}>When clients are assigned to you, they will appear here.</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No matches found</p>
              <p style={styles.emptyText}>Try a different name or email search.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredClients.map((client) => {
                const summary = client.checkin_schedule_started_at
                  ? getCoachClientCheckinSummary(client.id, client.checkin_schedule_started_at, checkins)
                  : null

                return (
                <button
                  key={client.id}
                  type="button"
                  style={{ ...styles.listItem, flexDirection: 'column', alignItems: 'stretch' }}
                  onClick={() => router.push(`/coach/client/${client.id}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={styles.clientMain}>
                      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4, color: colors.textPrimary }}>{client.name || 'Unnamed client'}</div>
                      <div style={{ color: colors.textSecondary, fontSize: 14 }}>{client.email || 'No email'}</div>
                    </div>
                    <span style={{
                      flexShrink: 0,
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: `1px solid ${colors.borderSubtle}`,
                      backgroundColor: colors.bgCard,
                      color: colors.accent,
                      fontSize: 13,
                      fontWeight: 700,
                    }}>
                      View profile
                    </span>
                  </div>
                  <div style={styles.clientMeta}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Coaching week</span>
                      <span>{summary ? `Week ${summary.activeCoachingWeek}` : '—'}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Next check-in</span>
                      <span>
                        {summary?.nextCheckin
                          ? getCheckinTypeDisplayName(summary.nextCheckin.type)
                          : client.checkin_schedule_started_at
                            ? '—'
                            : 'Starts after first plan'}
                      </span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Countdown</span>
                      <span>{summary?.countdownDetailed ?? (summary?.nextCheckinStatus === 'available' ? 'Today' : '—')}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Mid-week</span>
                      <span>{summary ? getCheckinStatusLabel(summary.midWeekStatus) : '—'}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Weekly</span>
                      <span>{summary ? getCheckinStatusLabel(summary.weeklyStatus) : '—'}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Goal</span>
                      <span>{formatFitnessGoal(client.fitness_goal)}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Plan</span>
                      <span style={client.plan_delivered ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
                        {getPlanStatus(client)}
                      </span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Legacy status</span>
                      <span style={
                        client.checkin_overdue
                          ? coachBadgeStyles.overdue
                          : client.checkin_awaiting
                            ? coachBadgeStyles.awaiting
                            : coachBadgeStyles.ok
                      }>
                        {getCheckinStatus(client)}
                      </span>
                    </div>
                    {client.complexity_score != null && client.complexity_tier && (
                      <div style={styles.metaItem}>
                        <span style={styles.metaLabel}>Complexity</span>
                        <span
                          style={{
                            ...coachBadgeStyles.ok,
                            backgroundColor: COMPLEXITY_TIER_COLORS[client.complexity_tier].bg,
                            color: COMPLEXITY_TIER_COLORS[client.complexity_tier].text,
                          }}
                        >
                          {client.complexity_score} · {formatTierLabel(client.complexity_tier)}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              )})}
            </div>
          )}
        </div>
    </CoachShell>
  );
}
