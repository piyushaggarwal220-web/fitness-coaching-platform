'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import CoachNavbar from '../../../components/CoachNavbar';
import {
  formatCheckinDate,
  formatWaistChange,
  formatWeightChange,
  parseCoachResponse,
  serializeCoachResponse,
} from '@/lib/checkin';
import { formatFitnessGoal } from '@/lib/coach-utils';
import type { Checkin, CheckinWithClient, Coach, CoachCheckinResponse } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function CoachCheckinDetailPage() {
  const router = useRouter();
  const params = useParams();
  const checkinId = typeof params.id === 'string' ? params.id : '';

  const [coach, setCoach] = useState<Coach | null>(null);
  const [checkin, setCheckin] = useState<CheckinWithClient | null>(null);
  const [previous, setPrevious] = useState<Checkin | null>(null);
  const [clientProfile, setClientProfile] = useState<{ fitness_goal: string | null; age: string | number | null } | null>(null);
  const [response, setResponse] = useState<CoachCheckinResponse>({ feedback: '', action_items: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!checkinId) {
      setError('Invalid check-in ID.');
      setLoading(false);
      return;
    }

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

      const { data: checkinData, error: checkinError } = await supabase
        .from('checkins')
        .select('*, profiles:client_id(name, email)')
        .eq('id', checkinId)
        .eq('coach_id', coachData.id)
        .single();

      if (checkinError || !checkinData) {
        setError('Check-in not found or not assigned to you.');
        setLoading(false);
        return;
      }

      const record = checkinData as CheckinWithClient;
      setCheckin(record);
      setResponse(parseCoachResponse(record.coach_response));

      const { data: profileData } = await supabase
        .from('profiles')
        .select('fitness_goal, age')
        .eq('id', record.client_id)
        .single();

      setClientProfile(profileData);

      const { data: prevData } = await supabase
        .from('checkins')
        .select('*')
        .eq('client_id', record.client_id)
        .lt('submitted_at', record.submitted_at)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setPrevious(prevData);
      setLoading(false);
    };

    load();
  }, [checkinId, router]);

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!checkin || !response.feedback.trim()) {
      setError('Feedback is required before marking as reviewed.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase
      .from('checkins')
      .update({
        coach_response: serializeCoachResponse(response),
        reviewed: true,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', checkin.id);

    if (updateError) {
      setError('Failed to save review: ' + updateError.message);
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ checkin_awaiting: false })
      .eq('id', checkin.client_id);

    if (profileError) {
      setError('Review saved but failed to update client status.');
      setSubmitting(false);
      return;
    }

    setSuccess('Check-in marked as reviewed.');
    setCheckin({ ...checkin, reviewed: true, reviewed_at: new Date().toISOString(), coach_response: serializeCoachResponse(response) });
    setSubmitting(false);
  };

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading check-in...</div>
      </>
    );
  }

  if (error && !checkin) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href="/coach/checkins" style={styles.backLink}>← Back to check-ins</Link>
          <div style={styles.errorBox}>{error}</div>
        </div>
      </>
    );
  }

  if (!checkin) return null;

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <Link href="/coach/checkins" style={styles.backLink}>← Back to check-ins</Link>

        <div style={styles.header}>
          <h1 style={styles.title}>{checkin.profiles?.name || checkin.profiles?.email || 'Client check-in'}</h1>
          <p style={styles.subtitle}>Submitted {formatCheckinDate(checkin.submitted_at)}</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <div style={styles.grid}>
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Client info</h2>
            <InfoRow label="Name" value={checkin.profiles?.name || '—'} />
            <InfoRow label="Email" value={checkin.profiles?.email || '—'} />
            <InfoRow label="Goal" value={formatFitnessGoal(clientProfile?.fitness_goal)} />
            <InfoRow label="Age" value={clientProfile?.age != null ? String(clientProfile.age) : '—'} />
          </section>

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Measurements</h2>
            <InfoRow label="Weight" value={formatWeightChange(checkin.weight, previous?.weight ?? null)} />
            <InfoRow label="Waist" value={formatWaistChange(checkin.waist, previous?.waist ?? null)} />
          </section>

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Scores (1–10)</h2>
            <InfoRow label="Energy" value={String(checkin.energy_level ?? '—')} />
            <InfoRow label="Hunger" value={String(checkin.hunger_level ?? '—')} />
            <InfoRow label="Training" value={String(checkin.training_performance ?? '—')} />
            <InfoRow label="Adherence" value={String(checkin.adherence_score ?? '—')} />
          </section>
        </div>

        {checkin.notes && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Client notes</h2>
            <p style={styles.notes}>{checkin.notes}</p>
          </section>
        )}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Progress photos</h2>
          <div style={styles.photoGrid}>
            <Photo label="Front" url={checkin.progress_photo_front} />
            <Photo label="Side" url={checkin.progress_photo_side} />
            <Photo label="Back" url={checkin.progress_photo_back} />
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Coach review</h2>
          {checkin.reviewed && (
            <p style={styles.reviewedBadge}>Reviewed {formatCheckinDate(checkin.reviewed_at)}</p>
          )}
          <form onSubmit={handleSubmitReview}>
            <div style={styles.field}>
              <label style={styles.label}>Feedback *</label>
              <textarea
                value={response.feedback}
                onChange={(e) => setResponse({ ...response, feedback: e.target.value })}
                rows={4}
                style={styles.textarea}
                placeholder="Overall feedback for the client..."
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Action items</label>
              <textarea
                value={response.action_items}
                onChange={(e) => setResponse({ ...response, action_items: e.target.value })}
                rows={3}
                style={styles.textarea}
                placeholder="Specific changes for next week..."
              />
            </div>
            {!checkin.reviewed && (
              <button type="submit" disabled={submitting} style={styles.submitBtn}>
                {submitting ? 'Saving...' : 'Mark as reviewed'}
              </button>
            )}
          </form>
        </section>
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

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div style={styles.photoWrap}>
      <span style={styles.photoLabel}>{label}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${label} progress`} style={styles.photo} />
      ) : (
        <div style={styles.noPhoto}>No photo</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 960, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 20, fontWeight: 600 },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 },
  card: { backgroundColor: 'white', padding: 22, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: 16 },
  cardTitle: { margin: '0 0 16px 0', fontSize: 18 },
  infoRow: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase' },
  infoValue: { fontSize: 15, fontWeight: 500 },
  notes: { margin: 0, lineHeight: 1.6, color: '#333' },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  photoWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  photoLabel: { fontSize: 13, fontWeight: 600, color: '#666' },
  photo: { width: '100%', borderRadius: 8, objectFit: 'cover', aspectRatio: '3/4', backgroundColor: '#f0f0f0' },
  noPhoto: { padding: 40, textAlign: 'center', backgroundColor: '#f5f5f5', borderRadius: 8, color: '#999' },
  field: { marginBottom: 16 },
  label: { display: 'block', marginBottom: 6, fontWeight: 500 },
  textarea: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' },
  submitBtn: { padding: '12px 24px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16 },
  reviewedBadge: { color: '#155724', backgroundColor: '#d4edda', display: 'inline-block', padding: '6px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  success: { backgroundColor: '#d4edda', color: '#155724', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorBox: { backgroundColor: '#f8d7da', color: '#721c24', padding: 24, borderRadius: 12, marginTop: 20 },
};
