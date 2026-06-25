'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ACTIVITY_OPTIONS,
  authenticateClient,
  DIET_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  GENDER_OPTIONS,
  INITIAL_ONBOARDING_FORM,
  ONBOARDING_STEPS,
  SLEEP_OPTIONS,
  TRAINING_OPTIONS,
  uploadOnboardingPhoto,
  validateOnboardingStep,
} from '@/lib/onboarding';
import type { OnboardingFormData } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type PhotoKey = 'front' | 'side' | 'back';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingFormData>(INITIAL_ONBOARDING_FORM);
  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = async () => {
      const result = await authenticateClient(supabase, router, {
        redirectIfOnboarded: true,
        requirePayment: true,
      });
      if (!result) return;

      setUserId(result.user.id);
      if (result.profile) {
        setForm({
          name: result.profile.name ?? '',
          age: result.profile.age != null ? String(result.profile.age) : '',
          gender: result.profile.gender ?? '',
          height: result.profile.height != null ? String(result.profile.height) : '',
          weight: result.profile.weight != null ? String(result.profile.weight) : '',
          fitness_goal: result.profile.fitness_goal ?? '',
          training_experience: result.profile.training_experience ?? '',
          activity_level: result.profile.activity_level ?? '',
          diet_preference: result.profile.diet_preference ?? '',
          injuries: result.profile.injuries ?? '',
          medical_notes: result.profile.medical_notes ?? '',
          sleep_duration: result.profile.sleep_duration ?? '',
          terms_accepted: Boolean(result.profile.terms_accepted_at),
        });
      }
      setLoading(false);
    };
    init();
  }, [router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
    setError('');
  };

  const handlePhotoChange = (key: PhotoKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotos((prev) => ({ ...prev, [key]: file }));
    setError('');
  };

  const handleNext = () => {
    const validationError = validateOnboardingStep(step, form, photos);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, ONBOARDING_STEPS.length - 1));
  };

  const handleBack = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateOnboardingStep(step, form, photos);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!userId || !photos.front || !photos.side || !photos.back) return;

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();

      const [frontUrl, sideUrl, backUrl] = await Promise.all([
        uploadOnboardingPhoto(supabase, userId, photos.front, 'front'),
        uploadOnboardingPhoto(supabase, userId, photos.side, 'side'),
        uploadOnboardingPhoto(supabase, userId, photos.back, 'back'),
      ]);

      const { error: saveError } = await supabase.from('profiles').upsert({
        id: userId,
        email: user?.email ?? null,
        name: form.name.trim(),
        age: Number(form.age),
        gender: form.gender,
        height: Number(form.height),
        weight: Number(form.weight),
        fitness_goal: form.fitness_goal,
        training_experience: form.training_experience,
        activity_level: form.activity_level,
        diet_preference: form.diet_preference,
        injuries: form.injuries || null,
        medical_notes: form.medical_notes || null,
        sleep_duration: form.sleep_duration,
        progress_photo_front: frontUrl,
        progress_photo_side: sideUrl,
        progress_photo_back: backUrl,
        terms_accepted_at: now,
        onboarding_complete: true,
        onboarding_completed_at: now,
        updated_at: now,
      });

      if (saveError) {
        throw new Error(saveError.message);
      }

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save onboarding';
      setError(message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading onboarding...</div>;
  }

  const progress = ((step + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Welcome! Let&apos;s get started</h1>
          <p style={styles.subtitle}>Payment confirmed — complete your profile so we can build your personalised plan.</p>
        </div>

        <div style={styles.progressWrap}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <div style={styles.stepLabels}>
            {ONBOARDING_STEPS.map((label, index) => (
              <span
                key={label}
                style={{
                  ...styles.stepLabel,
                  color: index <= step ? '#e94560' : '#999',
                  fontWeight: index === step ? 700 : 400,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={step === ONBOARDING_STEPS.length - 1 ? handleSubmit : (ev) => { ev.preventDefault(); handleNext(); }}>
          {step === 0 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Personal information</h2>
              <Field label="Full name" required>
                <input type="text" name="name" value={form.name} onChange={handleChange} required style={styles.input} />
              </Field>
              <Field label="Age" required>
                <input type="number" name="age" value={form.age} onChange={handleChange} min={13} max={100} required style={styles.input} />
              </Field>
              <Field label="Gender" required>
                <select name="gender" value={form.gender} onChange={handleChange} required style={styles.input}>
                  <option value="">Select gender</option>
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <div style={styles.row}>
                <Field label="Height (cm)" required>
                  <input type="number" name="height" value={form.height} onChange={handleChange} min={1} required style={styles.input} />
                </Field>
                <Field label="Weight (kg)" required>
                  <input type="number" name="weight" value={form.weight} onChange={handleChange} min={1} required style={styles.input} />
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Your goals</h2>
              <div style={styles.optionGrid}>
                {FITNESS_GOAL_OPTIONS.map((o) => (
                  <label key={o.value} style={styles.optionCard}>
                    <input type="radio" name="fitness_goal" value={o.value} checked={form.fitness_goal === o.value} onChange={handleChange} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Training experience</h2>
              <div style={styles.optionGrid}>
                {TRAINING_OPTIONS.map((o) => (
                  <label key={o.value} style={styles.optionCard}>
                    <input type="radio" name="training_experience" value={o.value} checked={form.training_experience === o.value} onChange={handleChange} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Lifestyle</h2>
              <Field label="Activity level" required>
                <select name="activity_level" value={form.activity_level} onChange={handleChange} required style={styles.input}>
                  <option value="">Select activity level</option>
                  {ACTIVITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Sleep duration" required>
                <select name="sleep_duration" value={form.sleep_duration} onChange={handleChange} required style={styles.input}>
                  <option value="">Select sleep duration</option>
                  {SLEEP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Diet</h2>
              <div style={styles.optionGrid}>
                {DIET_OPTIONS.map((o) => (
                  <label key={o.value} style={styles.optionCard}>
                    <input type="radio" name="diet_preference" value={o.value} checked={form.diet_preference === o.value} onChange={handleChange} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Medical history</h2>
              <Field label="Injuries (optional)">
                <textarea name="injuries" value={form.injuries} onChange={handleChange} rows={3} style={styles.textarea} />
              </Field>
              <Field label="Medical notes (optional)">
                <textarea name="medical_notes" value={form.medical_notes} onChange={handleChange} rows={3} style={styles.textarea} />
              </Field>
            </div>
          )}

          {step === 6 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Progress photos</h2>
              <p style={styles.hint}>Upload front, side, and back photos for your coach baseline.</p>
              {(['front', 'side', 'back'] as PhotoKey[]).map((key) => (
                <Field key={key} label={`${key.charAt(0).toUpperCase()}${key.slice(1)} photo`} required>
                  <input type="file" accept="image/*" onChange={handlePhotoChange(key)} required style={styles.input} />
                </Field>
              ))}
            </div>
          )}

          {step === 7 && (
            <div style={styles.stepContent}>
              <h2 style={styles.stepTitle}>Terms &amp; conditions</h2>
              <label style={styles.termsBox}>
                <input type="checkbox" name="terms_accepted" checked={form.terms_accepted} onChange={handleChange} />
                <span>
                  I agree to the coaching terms, understand results depend on adherence, and confirm
                  the health information provided is accurate.
                </span>
              </label>
            </div>
          )}

          <div style={styles.actions}>
            {step > 0 && (
              <button type="button" onClick={handleBack} style={styles.backBtn} disabled={submitting}>
                Back
              </button>
            )}
            {step < ONBOARDING_STEPS.length - 1 ? (
              <button type="submit" style={styles.nextBtn}>Continue</button>
            ) : (
              <button type="submit" style={styles.nextBtn} disabled={submitting}>
                {submitting ? 'Saving...' : 'Complete onboarding'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}{required ? ' *' : ''}</label>
      {children}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '30px 20px' },
  card: { maxWidth: 640, margin: '0 auto', backgroundColor: 'white', borderRadius: 12, padding: '32px 28px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  header: { marginBottom: 28 },
  title: { margin: 0, fontSize: 28, color: '#1a1a2e' },
  subtitle: { color: '#666', marginTop: 8, lineHeight: 1.5 },
  progressWrap: { marginBottom: 28 },
  progressBar: { height: 6, backgroundColor: '#eee', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#e94560', borderRadius: 999, transition: 'width 0.3s' },
  stepLabels: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 10 },
  stepLabel: { flex: '1 1 auto', minWidth: 50, textAlign: 'center' },
  stepContent: { marginBottom: 24 },
  stepTitle: { margin: '0 0 16px 0', fontSize: 20 },
  hint: { color: '#666', marginTop: -8, marginBottom: 16, fontSize: 14 },
  field: { marginBottom: 18 },
  label: { display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 },
  input: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', backgroundColor: 'white' },
  textarea: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 },
  optionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
  optionCard: { display: 'flex', alignItems: 'center', gap: 10, padding: 14, border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 15 },
  termsBox: { display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.5 },
  actions: { display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' },
  backBtn: { padding: '12px 24px', backgroundColor: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 16 },
  nextBtn: { padding: '12px 28px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, fontWeight: 600 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 20, color: '#666' },
};
