'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import CoachNavbar from '../../../components/CoachNavbar';
import { requireCoach } from '@/lib/coach-session';
import {
  coachBadgeStyles,
  formatDate,
  formatFitnessGoal,
  getCheckinStatus,
  getPlanStatus,
} from '@/lib/coach-utils';
import type { Coach, CoachClientDetail, Workout } from '@/types/database';

const supabase = createClient();

export default function CoachClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = typeof params.id === 'string' ? params.id : '';

  const [coach, setCoach] = useState<Coach | null>(null);
  const [client, setClient] = useState<CoachClientDetail | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
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

      const { data: workoutsData } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10);

      setWorkouts(workoutsData ?? []);
      setLoading(false);
    };

    loadClient();
  }, [clientId, router]);

  if (!clientId) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>
          <div style={styles.errorBox}>
            <p style={styles.errorText}>Invalid client ID.</p>
            <button style={styles.retryBtn} onClick={() => router.push('/coach/clients')}>
              Return to client list
            </button>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading client profile...</div>
      </>
    );
  }

  if (error || !client) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{error || 'Client not found.'}</p>
            <button style={styles.retryBtn} onClick={() => router.push('/coach/clients')}>
              Return to client list
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <Link href="/coach/clients" style={styles.backLink}>← Back to clients</Link>

        <div style={styles.header}>
          <h1 style={styles.title}>{client.name || 'Unnamed client'}</h1>
          <p style={styles.subtitle}>{client.email || 'No email on file'}</p>
        </div>

        <div style={styles.actions}>
          <button style={styles.generateBtn} onClick={() => router.push(`/coach/client/${client.id}/generate-plan`)}>
            Generate plan
          </button>
          <button style={styles.actionBtn} onClick={() => router.push(`/coach/plan/new?clientId=${client.id}`)}>
            Create plan manually
          </button>
        </div>

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
      </div>
    </>
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
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 900, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 20, fontWeight: 600 },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  generateBtn: { padding: '10px 18px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  actionBtn: { padding: '10px 18px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
  statusRow: { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statusCard: {
    backgroundColor: 'white',
    padding: '16px 20px',
    borderRadius: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 160,
  },
  statusLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  section: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    marginBottom: 20,
  },
  sectionTitle: { margin: '0 0 20px 0', fontSize: 20 },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
  },
  infoRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  infoValue: { fontSize: 16, fontWeight: 500, color: '#1a1a2e' },
  workoutList: { display: 'flex', flexDirection: 'column', gap: 10 },
  workoutCard: { padding: 14, border: '1px solid #eee', borderRadius: 8 },
  workoutName: { fontWeight: 600, marginBottom: 4 },
  workoutMeta: { fontSize: 14, color: '#666' },
  emptyText: { color: '#666', margin: 0 },
  errorBox: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: 24,
    borderRadius: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: { margin: '0 0 16px 0' },
  retryBtn: {
    padding: '10px 20px',
    backgroundColor: '#1a1a2e',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  },
};
