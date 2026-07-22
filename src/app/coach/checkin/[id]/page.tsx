'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CoachShell } from '@/components/ui/CoachShell';
import { coachPageStyles } from '@/lib/coach-page-styles';
import { colors } from '@/lib/coach-theme';
import { requireCoach } from '@/lib/coach-session';
import { sendClientNotification } from '@/lib/notifications/client'
import {
  CHECKIN_PHOTO_BUCKET,
  formatCheckinDate,
  formatWaistChange,
  formatWeightChange,
  parseCoachResponse,
  serializeCoachResponse,
} from '@/lib/checkin';
import { getCheckinTypeLabel } from '@/lib/checkin-schedule';
import { formatFitnessGoal } from '@/lib/coach-utils';
import { WeeklyCoachingPanel } from '@/components/coach/ai-actions/WeeklyCoachingPanel';
import { StorageImage } from '@/components/ui/StorageImage';
import type { Checkin, CheckinWithClient, CoachCheckinResponse } from '@/types/database';

const supabase = createClient();

export default function CoachCheckinDetailPage() {
  const router = useRouter();
  const params = useParams();
  const checkinId = typeof params.id === 'string' ? params.id : '';

  const [checkin, setCheckin] = useState<CheckinWithClient | null>(null);
  const [previous, setPrevious] = useState<Checkin | null>(null);
  const [clientProfile, setClientProfile] = useState<{ fitness_goal: string | null; age: string | number | null } | null>(null);
  const [response, setResponse] = useState<CoachCheckinResponse>({ feedback: '', action_items: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

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

  if (!checkinId) {
    return (
      <CoachShell narrow>
        <Link href="/coach/checkins" style={styles.backLink}>← Back to check-ins</Link>
        <div style={styles.errorBox}>Invalid check-in ID.</div>
      </CoachShell>
    );
  }

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

    void sendClientNotification({
      userId: checkin.client_id,
      type: 'coach_replied',
      title: 'Check-in reviewed',
      body: 'Your coach has reviewed your check-in. View feedback in your journey.',
      actionUrl: '/journey',
      metadata: {
        messageSnippet: 'Your coach has reviewed your check-in. View feedback in your journey.',
      },
    });

    setSuccess('Check-in marked as reviewed.');
    setCheckin({ ...checkin, reviewed: true, reviewed_at: new Date().toISOString(), coach_response: serializeCoachResponse(response) });
    setSubmitting(false);
  };

  if (loading) {
    return <CoachShell loading narrow />;
  }

  if (error && !checkin) {
    return (
      <CoachShell narrow>
        <Link href="/coach/checkins" style={styles.backLink}>← Back to check-ins</Link>
        <div style={styles.errorBox}>{error}</div>
      </CoachShell>
    );
  }

  if (!checkin) return null;

  const isWeekly = checkin.checkin_type === 'weekly';
  const extraPhotos = Array.isArray(checkin.extra_photos) ? checkin.extra_photos : [];

  return (
    <CoachShell narrow>
        <Link href="/coach/checkins" style={styles.backLink}>← Back to check-ins</Link>

        <div style={styles.header}>
          <h1 style={styles.title}>{checkin.profiles?.name || checkin.profiles?.email || 'Client check-in'}</h1>
          <p style={styles.subtitle}>
            {getCheckinTypeLabel(checkin.checkin_type)}
            {checkin.coaching_week ? ` · Week ${checkin.coaching_week}` : ''}
            {' · '}Submitted {formatCheckinDate(checkin.submitted_at)}
          </p>
          <Link href={`/coach/chat?clientId=${checkin.client_id}`} style={styles.chatLink}>
            Reply in chat →
          </Link>
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

          {isWeekly && (
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Measurements</h2>
              <InfoRow label="Weight" value={formatWeightChange(checkin.weight, previous?.weight ?? null)} />
              <InfoRow label="Chest" value={formatWaistChange(checkin.chest, previous?.chest ?? null)} />
              <InfoRow label="Thigh" value={formatWaistChange(checkin.thigh, previous?.thigh ?? null)} />
              <InfoRow
                label="Belly (navel)"
                value={formatWaistChange(checkin.navel ?? checkin.waist, previous?.navel ?? previous?.waist ?? null)}
              />
              {checkin.plan_version != null && (
                <InfoRow label="Plan version" value={`v${checkin.plan_version}`} />
              )}
            </section>
          )}

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Scores (1–10)</h2>
            <InfoRow label="Diet adherence" value={String(checkin.diet_adherence ?? checkin.adherence_score ?? '—')} />
            <InfoRow label="Workout adherence" value={String(checkin.workout_adherence ?? checkin.training_performance ?? '—')} />
            <InfoRow label="Energy" value={String(checkin.energy_level ?? '—')} />
            <InfoRow label="Sleep" value={String(checkin.sleep_quality ?? '—')} />
            <InfoRow label="Stress" value={String(checkin.stress_level ?? '—')} />
            <InfoRow label="Hunger" value={String(checkin.hunger_level ?? '—')} />
            {isWeekly && <InfoRow label="Motivation" value={String(checkin.motivation_level ?? '—')} />}
            {isWeekly && <InfoRow label="Progress" value={String(checkin.progress_rating ?? '—')} />}
          </section>
        </div>

        {!isWeekly && checkin.adherence_wins && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Adherence wins</h2>
            <p style={styles.notes}>{checkin.adherence_wins}</p>
          </section>
        )}

        {!isWeekly && checkin.adherence_struggles && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Adherence slips</h2>
            <p style={styles.notes}>{checkin.adherence_struggles}</p>
          </section>
        )}

        {isWeekly && checkin.progress_notes && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Progress notes</h2>
            <p style={styles.notes}>{checkin.progress_notes}</p>
          </section>
        )}

        {checkin.pain_injuries && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Pain / injuries</h2>
            <p style={styles.notes}>{checkin.pain_injuries}</p>
          </section>
        )}

        {checkin.questions_for_coach && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Questions for coach</h2>
            <p style={styles.notes}>{checkin.questions_for_coach}</p>
          </section>
        )}

        {isWeekly && checkin.digestion && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Digestion</h2>
            <p style={styles.notes}>{checkin.digestion}</p>
          </section>
        )}

        {isWeekly && checkin.cardio_completed && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Cardio completed</h2>
            <p style={styles.notes}>{checkin.cardio_completed}</p>
          </section>
        )}

        {checkin.notes && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>{isWeekly ? 'Additional notes' : 'Additional comments'}</h2>
            <p style={styles.notes}>{checkin.notes}</p>
          </section>
        )}

        {isWeekly && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Progress photos</h2>
            <div style={styles.photoGrid}>
              <Photo label="Front" url={checkin.progress_photo_front} />
              <Photo label="Side" url={checkin.progress_photo_side} />
              <Photo label="Back" url={checkin.progress_photo_back} />
            </div>
            {extraPhotos.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 8 }}>Extra photos</h3>
                <div style={styles.photoGrid}>
                  {extraPhotos.map((url, i) => (
                    <Photo key={i} label={`Extra ${i + 1}`} url={url} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {isWeekly && (
          <section style={styles.card}>
            <WeeklyCoachingPanel
              clientId={checkin.client_id}
              checkinId={checkin.id}
              coachId={checkin.coach_id}
              coachingWeek={checkin.coaching_week}
              checkinSubmittedAt={checkin.submitted_at}
            />
          </section>
        )}

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

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div style={styles.photoWrap}>
      <span style={styles.photoLabel}>{label}</span>
      {url ? (
        <StorageImage bucket={CHECKIN_PHOTO_BUCKET} src={url} alt={`${label} progress`} style={styles.photo} />
      ) : (
        <div style={styles.noPhoto}>No photo</div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  ...coachPageStyles,
  container: coachPageStyles.containerNarrow,
  backLink: coachPageStyles.backLink,
  header: coachPageStyles.header,
  title: coachPageStyles.title,
  subtitle: coachPageStyles.subtitle,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 },
  card: coachPageStyles.card,
  cardTitle: { margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary },
  infoRow: coachPageStyles.metaItem,
  infoLabel: coachPageStyles.metaLabel,
  infoValue: { fontSize: 15, fontWeight: 500, color: colors.textPrimary },
  notes: { margin: 0, lineHeight: 1.6, color: colors.textSecondary },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  photoWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  photoLabel: { fontSize: 13, fontWeight: 600, color: colors.textSecondary },
  photo: { width: '100%', borderRadius: 12, objectFit: 'cover', aspectRatio: '3/4', backgroundColor: colors.bgElevated },
  noPhoto: { padding: 40, textAlign: 'center', backgroundColor: colors.bgElevated, borderRadius: 12, color: colors.textMuted },
  field: { marginBottom: 16 },
  label: coachPageStyles.label,
  textarea: coachPageStyles.textarea,
  submitBtn: coachPageStyles.primaryBtn,
  reviewedBadge: { color: colors.success, backgroundColor: colors.successMuted, display: 'inline-block', padding: '6px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 600 },
  error: coachPageStyles.error,
  success: coachPageStyles.success,
  errorBox: { ...coachPageStyles.card, borderColor: colors.danger },
  chatLink: {
    display: 'inline-block',
    marginTop: 12,
    fontSize: 14,
    fontWeight: 600,
    color: colors.accent,
    textDecoration: 'none',
  },
};
