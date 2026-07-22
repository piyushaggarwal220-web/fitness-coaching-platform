'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Slider, TextArea } from '@/components/ui/Input';
import { PhotoSourceControl } from '@/components/ui/PhotoSourceControl';
import { MeasurementScroller, NumberScroller } from '@/components/ui/MeasurementScroller';
import { PhotoCompareStrip } from '@/components/journey/PhotoCompareStrip';
import {
  INITIAL_WEEKLY_FORM,
  uploadCheckinPhoto,
  validateWeeklyCheckinForm,
} from '@/lib/checkin';
import { getCheckinUnavailableReason, isCheckinAvailableToday } from '@/lib/checkin-schedule';
import { brandTitle } from '@/lib/brand';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { readApiJson } from '@/lib/api-response';
import { authenticateClient } from '@/lib/onboarding';
import { requestComplexityRecalculation } from '@/lib/complexity/client';
import { SlideTransition, SuccessState } from '@/components/motion'
import { mobileStyles } from '@/lib/mobile-styles';
import { colors, spacing } from '@/lib/design-tokens';
import { validatePhotoFiles } from '@/lib/photo';
import type { Checkin, OnboardingProfile, Plan, WeeklyCheckinFormData } from '@/types/database';

const supabase = createClient();

type PhotoKey = 'front' | 'side' | 'back';
const SECTIONS = ['measurements', 'scores', 'progress', 'photos'] as const;
type Section = typeof SECTIONS[number];

type PreviousPhotos = {
  front: string | null
  side: string | null
  back: string | null
  label: string
}

export default function CheckinPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [checkins, setCheckins] = useState<Pick<Checkin, 'checkin_type' | 'coaching_week'>[]>([]);
  const [form, setForm] = useState<WeeklyCheckinFormData>(INITIAL_WEEKLY_FORM);
  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>({ front: null, side: null, back: null });
  const [photoPreviews, setPhotoPreviews] = useState<Partial<Record<PhotoKey, string>>>({});
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [previousPhotos, setPreviousPhotos] = useState<PreviousPhotos | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [available, setAvailable] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string>('');
  const [currentSection, setCurrentSection] = useState<Section>('measurements');
  const [slideDirection, setSlideDirection] = useState<'forward' | 'back'>('forward');

  useEffect(() => {
    const init = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) { setLoading(false); return; }
      setProfile(result.profile);

      const userId = result.user.id;
      const [{ data: checkinRows }, { data: planData }, { data: lastWeekly }] = await Promise.all([
        supabase.from('checkins').select('checkin_type, coaching_week').eq('client_id', userId),
        supabase.from('plans').select('*').eq('client_id', userId).eq('active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from('checkins')
          .select('progress_photo_front, progress_photo_side, progress_photo_back, coaching_week, submitted_at')
          .eq('client_id', userId)
          .eq('checkin_type', 'weekly')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const rows = (checkinRows ?? []) as Pick<Checkin, 'checkin_type' | 'coaching_week'>[];
      setCheckins(rows);
      setActivePlan(planData);

      if (lastWeekly?.progress_photo_front || lastWeekly?.progress_photo_side || lastWeekly?.progress_photo_back) {
        setPreviousPhotos({
          front: lastWeekly.progress_photo_front,
          side: lastWeekly.progress_photo_side,
          back: lastWeekly.progress_photo_back,
          label: lastWeekly.coaching_week != null ? `Week ${lastWeekly.coaching_week}` : 'Last week',
        })
      }

      // Prefill girths from onboarding baseline when available
      const m = result.profile?.onboarding_data?.measurements
      if (m) {
        setForm((prev) => ({
          ...prev,
          chest: prev.chest || m.chest || '',
          thigh: prev.thigh || m.thigh || '',
          navel: prev.navel || m.navel || '',
        }))
      }

      const scheduleStartedAt = result.profile?.checkin_schedule_started_at;
      const bypassSchedule = shouldBypassCheckinScheduleClient();
      const isAvailable = isCheckinAvailableToday(scheduleStartedAt, 'weekly', rows, new Date(), { bypassSchedule });
      setAvailable(isAvailable);
      if (!isAvailable) {
        const reason = getCheckinUnavailableReason(scheduleStartedAt, 'weekly', rows, new Date());
        setUnavailableReason(
          reason === 'plan_not_delivered'
            ? 'Your check-in schedule will begin when your coach delivers your first plan.'
            : reason === 'window_closed'
              ? 'This weekly check-in window has closed (48 hours). Please wait for your next scheduled check-in.'
            : reason === 'waiting_mid_week'
              ? 'Complete your Day 3 mid-week check-in first (or wait if that window closed).'
              : reason === 'already_submitted'
                ? 'You already submitted this weekly check-in.'
                : 'Your weekly check-in is not available yet. Check your dashboard for the next scheduled check-in.'
        );
      }
      setLoading(false);
    };
    init();
  }, [router]);

  useEffect(() => {
    const urls: Partial<Record<PhotoKey, string>> = {}
    for (const key of ['front', 'side', 'back'] as PhotoKey[]) {
      const file = photos[key]
      if (file) urls[key] = URL.createObjectURL(file)
    }
    setPhotoPreviews(urls)
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [photos]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handlePhoto = (key: PhotoKey) => (files: File[]) => {
    const file = files[0] ?? null;
    const validationError = file ? validatePhotoFiles([file]) : null;
    if (validationError) {
      setError(validationError);
      return;
    }
    setPhotos((prev) => ({ ...prev, [key]: file }));
    setError('');
  };

  const handleExtraPhotos = (files: File[]) => {
    const validationError = validatePhotoFiles(files);
    if (validationError) {
      setError(validationError);
      return;
    }
    setExtraPhotos(files);
    setError('');
  };

  const sectionIndex = SECTIONS.indexOf(currentSection);
  const progress = ((sectionIndex + 1) / SECTIONS.length) * 100;

  const goNext = () => {
    const idx = SECTIONS.indexOf(currentSection);
    if (idx < SECTIONS.length - 1) {
      setSlideDirection('forward');
      setCurrentSection(SECTIONS[idx + 1]);
    }
  };

  const goPrev = () => {
    const idx = SECTIONS.indexOf(currentSection);
    if (idx > 0) {
      setSlideDirection('back');
      setCurrentSection(SECTIONS[idx - 1]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateWeeklyCheckinForm(form, photos);
    if (validationError) { setError(validationError); return; }
    if (!profile?.coach_id) {
      setError('No coach assigned to your account. Contact support before submitting a check-in.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const [frontUrl, sideUrl, backUrl, ...extraUrls] = await Promise.all([
        uploadCheckinPhoto(supabase, user.id, photos.front!, 'front'),
        uploadCheckinPhoto(supabase, user.id, photos.side!, 'side'),
        uploadCheckinPhoto(supabase, user.id, photos.back!, 'back'),
        ...extraPhotos.map((file, i) => uploadCheckinPhoto(supabase, user.id, file, `extra_${i}`)),
      ]);

      const res = await fetch('/api/checkin/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          checkinType: 'weekly',
          weight: Number(form.weight),
          chest: Number(form.chest),
          thigh: Number(form.thigh),
          navel: Number(form.navel),
          diet_adherence: Number(form.diet_adherence),
          workout_adherence: Number(form.workout_adherence),
          energy_level: Number(form.energy_level),
          sleep_quality: Number(form.sleep_quality),
          stress_level: Number(form.stress_level),
          hunger_level: Number(form.hunger_level),
          motivation_level: Number(form.motivation_level),
          progress_rating: Number(form.progress_rating),
          progress_notes: form.progress_notes.trim(),
          digestion: form.digestion || null,
          pain_injuries: form.pain_injuries || null,
          cardio_completed: form.cardio_completed || null,
          additional_notes: form.additional_notes || null,
          progress_photo_front: frontUrl,
          progress_photo_side: sideUrl,
          progress_photo_back: backUrl,
          extra_photos: extraUrls,
          plan_version: activePlan?.version ?? null,
        }),
      });

      const parsed = await readApiJson<{ success?: boolean; error?: string; checkinId?: string }>(res)
      if (!parsed.ok) throw new Error(parsed.error)

      const data = parsed.data
      if (!data.checkinId) throw new Error('Check-in saved but no ID returned.')

      await requestComplexityRecalculation({ trigger: 'weekly_checkin', checkinId: data.checkinId })

      setSuccess('Weekly check-in submitted! Photos + measurements earn league points.');
      setForm(INITIAL_WEEKLY_FORM);
      setPhotos({ front: null, side: null, back: null });
      setExtraPhotos([]);
      setTimeout(() => router.push('/league'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  const devMode = shouldBypassCheckinScheduleClient();

  if (loading) return <ClientShell title="Check-In" loading hideBottomNav />;

  if (!profile?.coach_id) {
    return (
      <ClientShell title="Check-In" hideBottomNav>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800 }}>{brandTitle('Weekly Check-In')}</h1>
        <div style={mobileStyles.info}>
          No coach is assigned to your account yet. Your coach will be assigned shortly.
        </div>
        <Button fullWidth onClick={() => router.push('/dashboard')}>Back to dashboard</Button>
      </ClientShell>
    );
  }

  if (!available) {
    return (
      <ClientShell title="Check-In" hideBottomNav>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800 }}>{brandTitle('Weekly Check-In')}</h1>
        <div style={mobileStyles.info}>
          {unavailableReason ||
            'Your weekly check-in is not available. Check your dashboard for the next scheduled check-in.'}
        </div>
        <Button fullWidth onClick={() => router.push('/dashboard')}>Back to dashboard</Button>
      </ClientShell>
    );
  }

  return (
    <ClientShell title="Check-In" hideBottomNav>
      {devMode && <DevelopmentModeBadge />}
      <div style={{ marginBottom: spacing[4] }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{brandTitle('Weekly Check-In')}</h1>
        <p style={{ margin: '8px 0 0', color: colors.textSecondary, fontSize: 15 }}>
          Day 7 progress update — photos required
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: spacing[5] }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>
            Step {sectionIndex + 1} of {SECTIONS.length}
          </span>
          <span style={{ fontSize: 13, color: colors.accent, fontWeight: 600, textTransform: 'capitalize' }}>
            {currentSection}
          </span>
        </div>
        <div style={{ height: 4, backgroundColor: colors.bgElevated, borderRadius: 999, overflow: 'hidden' }}>
          <div className="motion-progress-fill" style={{ height: '100%', width: `${progress}%`, backgroundColor: colors.accent, borderRadius: 999 }} />
        </div>
      </div>

      {error && <div className="motion-shake" style={mobileStyles.error}>{error}</div>}
      {success && <SuccessState message={success} />}

      <form onSubmit={handleSubmit}>
        <SlideTransition sectionKey={currentSection} direction={slideDirection}>
        {currentSection === 'measurements' && (
          <Card variant="elevated">
            <h2 style={sectionTitle}>Measurements</h2>
            <NumberScroller
              label="Weight"
              preset="weight"
              value={form.weight}
              onChange={(weight) => setForm((prev) => ({ ...prev, weight }))}
              required
            />
            <div style={{ display: 'grid', gap: 16, marginTop: 8 }}>
              <MeasurementScroller
                label="Chest"
                kind="chest"
                value={form.chest}
                onChange={(chest) => setForm((prev) => ({ ...prev, chest }))}
                required
              />
              <MeasurementScroller
                label="Thigh"
                kind="thigh"
                value={form.thigh}
                onChange={(thigh) => setForm((prev) => ({ ...prev, thigh }))}
                required
              />
              <MeasurementScroller
                label="Belly at navel"
                kind="navel"
                value={form.navel}
                onChange={(navel) => setForm((prev) => ({ ...prev, navel }))}
                required
              />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textMuted }}>
              Scroll each wheel to your soft-tape reading — belly is the circumference at navel height.
            </p>
          </Card>
        )}

        {currentSection === 'scores' && (
          <Card variant="elevated">
            <h2 style={sectionTitle}>How did this week go?</h2>
            <Slider label="Diet adherence" name="diet_adherence" value={form.diet_adherence || '5'} onChange={handleChange} />
            <Slider label="Workout adherence" name="workout_adherence" value={form.workout_adherence || '5'} onChange={handleChange} />
            <Slider label="Energy" name="energy_level" value={form.energy_level || '5'} onChange={handleChange} />
            <Slider label="Sleep" name="sleep_quality" value={form.sleep_quality || '5'} onChange={handleChange} />
            <Slider label="Stress" name="stress_level" value={form.stress_level || '5'} onChange={handleChange} />
            <Slider label="Hunger" name="hunger_level" value={form.hunger_level || '5'} onChange={handleChange} />
            <Slider label="Motivation" name="motivation_level" value={form.motivation_level || '5'} onChange={handleChange} />
            <Input label="Digestion" name="digestion" value={form.digestion} onChange={handleChange} placeholder="How has digestion been?" />
            <TextArea label="Pain / injuries" name="pain_injuries" value={form.pain_injuries} onChange={handleChange} rows={2} placeholder="Any pain or injuries this week?" />
            <Input label="Cardio completed" name="cardio_completed" value={form.cardio_completed} onChange={handleChange} placeholder="e.g. 3 sessions, 45 min total" />
            <TextArea label="Additional notes" name="additional_notes" value={form.additional_notes} onChange={handleChange} rows={3} placeholder="Wins, struggles, questions..." />
          </Card>
        )}

        {currentSection === 'progress' && (
          <Card variant="elevated">
            <h2 style={sectionTitle}>Progress vs last week</h2>
            <Slider label="Overall progress" name="progress_rating" value={form.progress_rating || '5'} onChange={handleChange} />
            <TextArea
              label="What changed since last week? *"
              name="progress_notes"
              value={form.progress_notes}
              onChange={handleChange}
              rows={4}
              placeholder="Shape, strength, clothes fit, energy, anything you notice in the mirror..."
              required
            />
            <PhotoCompareStrip
              previous={previousPhotos}
              current={{ label: 'This week', front: null, side: null, back: null }}
              currentPreviewUrls={photoPreviews}
            />
            <p style={{ margin: `${spacing[3]}px 0 0`, fontSize: 13, color: colors.textMuted }}>
              Add this week’s photos in the next step to finish the side-by-side compare.
            </p>
          </Card>
        )}

        {currentSection === 'photos' && (
          <Card variant="elevated">
            <h2 style={sectionTitle}>Progress Photos</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.textMuted }}>Front, side, and back photos are required — compare with last week below.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: spacing[3] }}>
              {(['front', 'side', 'back'] as PhotoKey[]).map((key) => (
                <PhotoSourceControl
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  required
                  onFiles={handlePhoto(key)}
                  selectedText={photos[key]?.name}
                />
              ))}
            </div>
            <div style={{ marginTop: spacing[4] }}>
              <PhotoSourceControl
                label="Optional extra photos"
                multiple
                onFiles={handleExtraPhotos}
                selectedText={extraPhotos.length > 0 ? `${extraPhotos.length} extra photo(s) selected` : undefined}
              />
            </div>
            <PhotoCompareStrip
              previous={previousPhotos}
              current={{ label: 'This week', front: null, side: null, back: null }}
              currentPreviewUrls={photoPreviews}
            />
          </Card>
        )}
        </SlideTransition>

        {/* Sticky action bar */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: spacing[3],
          paddingBottom: `max(${spacing[3]}px, env(safe-area-inset-bottom))`,
          backgroundColor: colors.bgGlass,
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid ${colors.divider}`,
          zIndex: 90,
          display: 'flex',
          gap: spacing[2],
        }}>
          {sectionIndex > 0 && (
            <Button type="button" variant="secondary" onClick={goPrev} style={{ flex: 1 }}>Back</Button>
          )}
          {sectionIndex < SECTIONS.length - 1 ? (
            <Button type="button" onClick={goNext} style={{ flex: 2 }}>
              Continue <ChevronRight size={18} />
            </Button>
          ) : (
            <Button type="submit" loading={submitting} fullWidth style={{ flex: 2 }}>
              Submit check-in
            </Button>
          )}
        </div>
        <div style={{ height: 80 }} />
      </form>
    </ClientShell>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 18,
  fontWeight: 700,
  color: colors.textPrimary,
};
