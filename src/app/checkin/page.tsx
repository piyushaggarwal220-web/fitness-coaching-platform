'use client';

import { useEffect, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import {
  INITIAL_CHECKIN_FORM,
  uploadCheckinPhoto,
  validateCheckinForm,
} from '@/lib/checkin';
import { authenticateClient } from '@/lib/onboarding';
import type { CheckinFormData, OnboardingProfile } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type PhotoKey = 'front' | 'side' | 'back';

export default function CheckinPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [form, setForm] = useState<CheckinFormData>(INITIAL_CHECKIN_FORM);
  const [photos, setPhotos] = useState<Record<PhotoKey, File | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const init = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true });
      if (!result) return;
      setProfile(result.profile);
      setLoading(false);
    };
    init();
  }, [router]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const handlePhoto = (key: PhotoKey) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPhotos((prev) => ({ ...prev, [key]: file }));
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validateCheckinForm(form, photos);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const [frontUrl, sideUrl, backUrl] = await Promise.all([
        uploadCheckinPhoto(supabase, user.id, photos.front!, 'front'),
        uploadCheckinPhoto(supabase, user.id, photos.side!, 'side'),
        uploadCheckinPhoto(supabase, user.id, photos.back!, 'back'),
      ]);

      const { error: insertError } = await supabase.from('checkins').insert({
        client_id: user.id,
        coach_id: profile.coach_id,
        weight: Number(form.weight),
        waist: Number(form.waist),
        progress_photo_front: frontUrl,
        progress_photo_side: sideUrl,
        progress_photo_back: backUrl,
        energy_level: Number(form.energy_level),
        hunger_level: Number(form.hunger_level),
        training_performance: Number(form.training_performance),
        adherence_score: Number(form.adherence_score),
        notes: form.notes || null,
        reviewed: false,
      });

      if (insertError) throw new Error(insertError.message);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ checkin_awaiting: true, checkin_overdue: false })
        .eq('id', user.id);

      if (profileError) throw new Error(profileError.message);

      setSuccess('Check-in submitted! Your coach will review it soon.');
      setForm(INITIAL_CHECKIN_FORM);
      setPhotos({ front: null, side: null, back: null });
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={styles.loading}>Loading check-in form...</div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={styles.container}>
        <h1 style={styles.title}>Weekly Check-In</h1>
        <p style={styles.subtitle}>Submit your progress update for coach review.</p>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Measurements</h2>
            <div style={styles.row}>
              <Field label="Weight (kg)" required>
                <input type="number" name="weight" value={form.weight} onChange={handleChange} min={1} step="0.1" required style={styles.input} />
              </Field>
              <Field label="Waist (cm)" required>
                <input type="number" name="waist" value={form.waist} onChange={handleChange} min={1} step="0.1" required style={styles.input} />
              </Field>
            </div>
          </section>

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>How did this week go? (1–10)</h2>
            <div style={styles.scoreGrid}>
              <ScoreField label="Energy" name="energy_level" value={form.energy_level} onChange={handleChange} />
              <ScoreField label="Hunger" name="hunger_level" value={form.hunger_level} onChange={handleChange} />
              <ScoreField label="Training" name="training_performance" value={form.training_performance} onChange={handleChange} />
              <ScoreField label="Adherence" name="adherence_score" value={form.adherence_score} onChange={handleChange} />
            </div>
          </section>

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Progress photos</h2>
            <div style={styles.photoGrid}>
              <PhotoField label="Front" onChange={handlePhoto('front')} file={photos.front} />
              <PhotoField label="Side" onChange={handlePhoto('side')} file={photos.side} />
              <PhotoField label="Back" onChange={handlePhoto('back')} file={photos.back} />
            </div>
          </section>

          <section style={styles.section}>
            <Field label="Notes for your coach">
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={4} style={styles.textarea} placeholder="Wins, struggles, questions..." />
            </Field>
          </section>

          <button type="submit" disabled={submitting} style={styles.submitBtn}>
            {submitting ? 'Submitting...' : 'Submit check-in'}
          </button>
        </form>
      </div>
    </>
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

function ScoreField({ label, name, value, onChange }: { label: string; name: string; value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <Field label={label} required>
      <input type="number" name={name} value={value} onChange={onChange} min={1} max={10} required style={styles.input} />
    </Field>
  );
}

function PhotoField({ label, onChange, file }: { label: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; file: File | null }) {
  return (
    <div style={styles.photoField}>
      <label style={styles.label}>{label} *</label>
      <input type="file" accept="image/*" onChange={onChange} style={styles.fileInput} />
      {file && <span style={styles.fileName}>{file.name}</span>}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 720, margin: '0 auto', padding: '30px 20px' },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 8, marginBottom: 24 },
  form: { backgroundColor: 'white', padding: 28, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  section: { marginBottom: 28 },
  sectionTitle: { margin: '0 0 16px 0', fontSize: 18 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 },
  scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 },
  field: { marginBottom: 0 },
  label: { display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 },
  input: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' },
  photoField: { padding: 14, border: '1px dashed #ccc', borderRadius: 8 },
  fileInput: { width: '100%', fontSize: 14 },
  fileName: { display: 'block', marginTop: 8, fontSize: 12, color: '#666' },
  submitBtn: { width: '100%', padding: 14, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 18, cursor: 'pointer', fontWeight: 600 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  success: { backgroundColor: '#d4edda', color: '#155724', padding: 12, borderRadius: 8, marginBottom: 16 },
};
