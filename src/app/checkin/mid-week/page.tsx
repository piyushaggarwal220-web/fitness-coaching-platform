'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ClientShell } from '@/components/ui/ClientShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Slider, TextArea } from '@/components/ui/Input';
import { INITIAL_MID_WEEK_FORM, validateMidWeekForm } from '@/lib/checkin';
import { getCheckinUnavailableReason, isCheckinAvailableToday } from '@/lib/checkin-schedule';
import { brandTitle } from '@/lib/brand';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { readApiJson } from '@/lib/api-response';
import { authenticateClient } from '@/lib/onboarding';
import { mobileStyles } from '@/lib/mobile-styles';
import { colors, spacing } from '@/lib/design-tokens';
import type { Checkin, MidWeekCheckinFormData, OnboardingProfile } from '@/types/database';

const supabase = createClient();

export default function MidWeekCheckinPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [checkins, setCheckins] = useState<Pick<Checkin, 'checkin_type' | 'coaching_week'>[]>([]);
  const [form, setForm] = useState<MidWeekCheckinFormData>(INITIAL_MID_WEEK_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState('');

  useEffect(() => {
    const init = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
      }
      setProfile(result.profile);

      const { data } = await supabase
        .from('checkins')
        .select('checkin_type, coaching_week')
        .eq('client_id', result.user.id);

      const rows = (data ?? []) as Pick<Checkin, 'checkin_type' | 'coaching_week'>[];
      setCheckins(rows);

      const scheduleStartedAt = result.profile?.checkin_schedule_started_at;
      const bypassSchedule = shouldBypassCheckinScheduleClient();
      const isAvailable = isCheckinAvailableToday(scheduleStartedAt, 'mid_week', rows, new Date(), { bypassSchedule });
      setAvailable(isAvailable);
      if (!isAvailable) {
        const reason = getCheckinUnavailableReason(scheduleStartedAt, 'mid_week', rows, new Date());
        setUnavailableReason(
          reason === 'plan_not_delivered'
            ? 'Check-ins start after your first plan is ready.'
            : reason === 'window_closed'
              ? 'This mid-week update window has closed. Your next check-in will show on Today.'
            : reason === 'already_submitted'
              ? 'You’ve already sent this mid-week update.'
              : 'This mid-week update isn’t open yet. You’ll see it on Today when it’s due.'
        );
      }

      setLoading(false);
    };
    init();
  }, [router]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateMidWeekForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!profile?.coach_id) {
      setError('No coach assigned to your account. Contact support before submitting a check-in.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/checkin/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          checkinType: 'mid_week',
          diet_adherence: Number(form.diet_adherence),
          workout_adherence: Number(form.workout_adherence),
          energy_level: Number(form.energy_level),
          sleep_quality: Number(form.sleep_quality),
          stress_level: Number(form.stress_level),
          hunger_level: Number(form.hunger_level),
          adherence_wins: form.adherence_wins.trim(),
          adherence_struggles: form.adherence_struggles.trim(),
          pain_injuries: form.pain_injuries || null,
          questions_for_coach: form.questions_for_coach || null,
          additional_comments: form.additional_comments || null,
        }),
      });

      const parsed = await readApiJson<{ success?: boolean; error?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)

      setSuccess('Mid-week update sent. Nice work!');
      setForm(INITIAL_MID_WEEK_FORM);
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  const devMode = shouldBypassCheckinScheduleClient();

  if (loading) return <ClientShell title="Check-in" loading hideBottomNav />;

  if (!profile?.coach_id) {
    return (
      <ClientShell title="Check-in" hideBottomNav>
        <h1 style={styles.title}>{brandTitle('Mid-week update')}</h1>
        <div style={styles.error}>Your coach will be assigned shortly.</div>
        <Button fullWidth onClick={() => router.push('/dashboard')}>Back to Today</Button>
      </ClientShell>
    );
  }

  if (!available) {
    return (
      <ClientShell title="Check-in" hideBottomNav>
        <h1 style={styles.title}>{brandTitle('Mid-week update')}</h1>
        <div style={styles.infoBox}>
          {unavailableReason || 'This mid-week update isn’t open yet.'}
        </div>
        <Button fullWidth onClick={() => router.push('/dashboard')}>Back to Today</Button>
      </ClientShell>
    );
  }

  return (
    <ClientShell title="Check-in" hideBottomNav>
        {devMode && <DevelopmentModeBadge />}
        <h1 style={styles.title}>{brandTitle('Mid-week update')}</h1>
        <p style={styles.subtitle}>A quick check-in so your coach can help you stay on track.</p>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <Card variant="elevated">
            <h2 style={styles.sectionTitle}>How this week feels (1–10)</h2>
            <Slider label="Following the diet" name="diet_adherence" value={form.diet_adherence || '5'} onChange={handleChange} />
            <Slider label="Following the workouts" name="workout_adherence" value={form.workout_adherence || '5'} onChange={handleChange} />
            <Slider label="Energy" name="energy_level" value={form.energy_level || '5'} onChange={handleChange} />
            <Slider label="Sleep" name="sleep_quality" value={form.sleep_quality || '5'} onChange={handleChange} />
            <Slider label="Stress" name="stress_level" value={form.stress_level || '5'} onChange={handleChange} />
            <Slider label="Hunger" name="hunger_level" value={form.hunger_level || '5'} onChange={handleChange} />
          </Card>

          <Card variant="elevated">
            <h2 style={styles.sectionTitle}>A bit more detail</h2>
            <TextArea
              label="What’s helping you stick to the plan? *"
              name="adherence_wins"
              value={form.adherence_wins}
              onChange={handleChange}
              rows={3}
              placeholder="e.g. Meal prep on Sunday, morning gym slot, coach accountability..."
              required
            />
            <TextArea
              label="Where did adherence slip? *"
              name="adherence_struggles"
              value={form.adherence_struggles}
              onChange={handleChange}
              rows={3}
              placeholder="e.g. Missed 1 workout, late-night snacking, skipped steps..."
              required
            />
            <TextArea label="Any pain or injuries?" name="pain_injuries" value={form.pain_injuries} onChange={handleChange} rows={3} placeholder="Describe any pain, soreness, or injuries..." />
            <TextArea label="Any questions for your coach?" name="questions_for_coach" value={form.questions_for_coach} onChange={handleChange} rows={3} placeholder="Questions for your coach..." />
            <TextArea label="Additional comments" name="additional_comments" value={form.additional_comments} onChange={handleChange} rows={3} placeholder="Anything else your coach should know..." />
          </Card>

          <Button type="submit" loading={submitting} fullWidth>Submit Day 3 check-in</Button>
        </form>
    </ClientShell>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: mobileStyles.loading,
  container: { paddingBottom: 80 },
  title: { margin: 0, fontSize: 28, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.02em' },
  subtitle: mobileStyles.subtitle,
  form: { marginBottom: spacing[4] },
  section: { marginBottom: spacing[4] },
  sectionTitle: { margin: '0 0 16px 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary },
  field: { marginBottom: spacing[3] },
  label: { display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14, color: colors.textSecondary },
  error: mobileStyles.error,
  success: mobileStyles.success,
  infoBox: mobileStyles.info,
};
