'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/design-tokens';
import { requireCoach } from '@/lib/coach-session';
import {
  coachBadgeStyles,
  formatDate,
  formatFitnessGoal,
  getCheckinStatus,
  getPlanStatus,
} from '@/lib/coach-utils';
import { ComplexityHistoryTimeline } from '@/components/complexity/ComplexityHistoryTimeline';
import { ComplexityScoreCard } from '@/components/complexity/ComplexityScoreCard';
import { CoachClientProfileEdit } from '@/components/coach/CoachClientProfileEdit';
import type { Coach, CoachClientDetail, Workout } from '@/types/database';

const supabase = createClient();

export default function CoachClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = typeof params.id === 'string' ? params.id : '';

  const [coach, setCoach] = useState<Coach | null>(null);
  const [client, setClient] = useState<CoachClientDetail | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClient = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientData, error: clientError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', coachData.id)
        .single();

      if (clientError || !clientData) {
        setError('Client not found or not assigned to you.');
        setLoading(false);
        return;
      }

      setClient(clientData);

      const [{ data: workoutsData }, { data: activePlan }] = await Promise.all([
        supabase
          .from('workouts')
          .select('*')
          .eq('user_id', clientId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('plans')
          .select('id')
          .eq('client_id', clientId)
          .eq('coach_id', coachData.id)
          .eq('active', true)
          .maybeSingle(),
      ]);

      setWorkouts(workoutsData ?? []);
      setActivePlanId(activePlan?.id ?? null);
      setLoading(false);
    };

    loadClient();
  }, [clientId, router]);

  if (!clientId) {
    return (
      <CoachShell narrow>
        <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>
        <div style={styles.errorBox}>
          <p style={styles.errorText}>Invalid client ID.</p>
          <button style={styles.retryBtn} onClick={() => router.push('/coach/clients')}>Return to client list</button>
        </div>
      </CoachShell>
    );
  }

  if (loading) {
    return <CoachShell loading narrow />;
  }

  if (error || !client) {
    return (
      <CoachShell narrow>
        <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error || 'Client not found.'}</p>
          <button style={styles.retryBtn} onClick={() => router.push('/coach/clients')}>Return to client list</button>
        </div>
      </CoachShell>
    );
  }

  return (
    <CoachShell narrow>
        <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>

        <div style={styles.header}>
          <h1 style={styles.title}>{client.name || 'Unnamed client'}</h1>
          <p style={styles.subtitle}>{client.email || 'No email on file'}</p>
        </div>

        <div style={styles.actions}>
          <button style={styles.generateBtn} onClick={() => router.push(`/coach/client/${client.id}/generate-plan`)}>
            AI coaching actions
          </button>
          {activePlanId ? (
            <button
              style={styles.actionBtn}
              onClick={() => router.push(`/coach/plan/${activePlanId}?ai=1`)}
            >
              Edit delivered plan
            </button>
          ) : (
            <button style={styles.actionBtn} onClick={() => router.push(`/coach/plan/new?clientId=${client.id}`)}>
              Create plan manually
            </button>
          )}
        </div>

        {client.complexity_input_needs_review && (
          <div style={styles.reviewBanner}>
            Client must confirm metrics before AI plan work.
            {Array.isArray(client.complexity_input_review_reasons) &&
            client.complexity_input_review_reasons.length > 0
              ? ` ${client.complexity_input_review_reasons.join(' ')}`
              : ''}
          </div>
        )}

        <div style={styles.statusRow}>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Plan status</span>
            <span style={client.plan_delivered ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
              {getPlanStatus(client)}
            </span>
          </div>
          <div style={styles.statusCard}>
            <span style={styles.statusLabel}>Check-in status</span>
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
          {client.checkin_overdue && (
            <span style={coachBadgeStyles.overdue}>Overdue flag active</span>
          )}
          {client.checkin_awaiting && (
            <span style={coachBadgeStyles.awaiting}>Awaiting response flag active</span>
          )}
        </div>

        <ComplexityScoreCard
          score={client.complexity_score}
          tier={client.complexity_tier}
          previousScore={client.complexity_previous_score}
          scoreChange={client.complexity_score_change}
          lastCalculatedAt={client.complexity_last_calculated_at}
        />

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Complexity History</h2>
          <ComplexityHistoryTimeline clientId={client.id} />
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Profile</h2>
          <div style={styles.infoGrid}>
            <InfoRow label="Name" value={client.name || '—'} />
            <InfoRow label="Email" value={client.email || '—'} />
            <InfoRow label="Age" value={client.age != null && client.age !== '' ? String(client.age) : '—'} />
            <InfoRow label="Height" value={client.height != null && client.height !== '' ? `${client.height} cm` : '—'} />
            <InfoRow label="Weight" value={client.weight != null && client.weight !== '' ? `${client.weight} kg` : '—'} />
            <InfoRow label="Fitness goal" value={formatFitnessGoal(client.fitness_goal)} />
            <InfoRow label="Coach assignment" value={coach?.name || 'Assigned to you'} />
            <InfoRow label="Profile updated" value={formatDate(client.updated_at)} />
          </div>
          <CoachClientProfileEdit client={client} onSaved={setClient} />
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent workouts</h2>
          {workouts.length === 0 ? (
            <p style={styles.emptyText}>No workouts logged yet.</p>
          ) : (
            <div style={styles.workoutList}>
              {workouts.map((workout) => (
                <div key={workout.id} style={styles.workoutCard}>
                  <div style={styles.workoutName}>{workout.name}</div>
                  <div style={styles.workoutMeta}>
                    {workout.duration} min · {workout.calories ?? 0} cal · {formatDate(workout.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </CoachShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  container: { ...coachPageStyles.containerNarrow },
  backLink: coachPageStyles.backLink,
  header: coachPageStyles.header,
  title: coachPageStyles.title,
  subtitle: coachPageStyles.subtitle,
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  generateBtn: coachPageStyles.primaryBtn,
  actionBtn: coachPageStyles.secondaryBtn,
  reviewBanner: {
    marginBottom: 16,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${colors.warning}`,
    backgroundColor: colors.warningMuted ?? colors.accentMuted,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 1.45,
  },
  statusRow: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statusCard: { ...coachPageStyles.card, marginBottom: 0, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 },
  statusLabel: coachPageStyles.metaLabel,
  section: coachPageStyles.card,
  sectionTitle: { margin: '0 0 20px 0', fontSize: 20, fontWeight: 700, color: colors.textPrimary },
  infoGrid: coachPageStyles.clientMeta,
  infoRow: coachPageStyles.metaItem,
  infoLabel: coachPageStyles.metaLabel,
  infoValue: { fontSize: 16, fontWeight: 500, color: colors.textPrimary },
  workoutList: { display: 'flex', flexDirection: 'column', gap: 10 },
  workoutCard: { padding: 14, border: `1px solid ${colors.borderSubtle}`, borderRadius: 12, backgroundColor: colors.bgElevated },
  workoutName: { fontWeight: 600, marginBottom: 4, color: colors.textPrimary },
  workoutMeta: { fontSize: 14, color: colors.textSecondary },
  emptyText: { color: colors.textMuted, margin: 0 },
  errorBox: { ...coachPageStyles.card, textAlign: 'center', borderColor: colors.danger },
  errorText: { margin: '0 0 16px 0', color: colors.danger },
  retryBtn: coachPageStyles.primaryBtn,
};
