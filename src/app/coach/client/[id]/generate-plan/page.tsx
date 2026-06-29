'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import CoachNavbar from '../../../../components/CoachNavbar';
import { createClient } from '@/lib/supabase/client';
import { requireCoach } from '@/lib/coach-session';
import { savePlanDraftToSession } from '@/lib/ai/plan-format';
import { getOnboardingLabel } from '@/lib/onboarding';
import { formatFitnessGoal } from '@/lib/coach-utils';
import type { CoachClientDetail, Coach } from '@/types/database';

const supabase = createClient();

export default function CoachGeneratePlanPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = typeof params.id === 'string' ? params.id : '';

  const [coach, setCoach] = useState<Coach | null>(null);
  const [client, setClient] = useState<CoachClientDetail | null>(null);
  const [coachInstructions, setCoachInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientData, error: clientError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', coachData.id)
        .maybeSingle();

      if (clientError || !clientData) {
        setError('Client not found or not assigned to you.');
        setLoading(false);
        return;
      }

      setClient(clientData);
      setLoading(false);
    };

    load();
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

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;

    setGenerating(true);
    setError('');

    try {
      const response = await fetch('/api/coach/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          coachInstructions: coachInstructions.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error ?? 'Plan generation failed.');
        setGenerating(false);
        return;
      }

      savePlanDraftToSession(client.id, data.formData);
      router.push(`/coach/plan/new?clientId=${client.id}&fromAi=1`);
    } catch {
      setError('Network error while generating plan.');
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading client data...</div>
      </>
    );
  }

  if (error && !client) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <Link href={`/coach/client/${clientId}`} style={styles.backLink}>← Back to client</Link>
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.retryBtn} onClick={() => router.push('/coach/clients')}>
              Return to client list
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!client) return null;

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <Link href={`/coach/client/${client.id}`} style={styles.backLink}>← Back to client</Link>

        <h1 style={styles.title}>Generate coaching plan</h1>
        <p style={styles.subtitle}>
          {client.name || client.email} · {coach?.name ? `by ${coach.name}` : 'AI draft workflow'}
        </p>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Onboarding data</h2>
          <div style={styles.infoGrid}>
            <InfoRow label="Fitness goal" value={formatFitnessGoal(client.fitness_goal)} />
            <InfoRow label="Training experience" value={getOnboardingLabel('training_experience', client.training_experience)} />
            <InfoRow label="Activity level" value={getOnboardingLabel('activity_level', client.activity_level)} />
            <InfoRow label="Diet preference" value={getOnboardingLabel('diet_preference', client.diet_preference)} />
            <InfoRow label="Age" value={client.age != null && client.age !== '' ? String(client.age) : '—'} />
            <InfoRow label="Weight" value={client.weight != null && client.weight !== '' ? `${client.weight} kg` : '—'} />
            {client.injuries && <InfoRow label="Injuries" value={client.injuries} />}
            {client.medical_notes && <InfoRow label="Medical notes" value={client.medical_notes} />}
          </div>
        </section>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleGenerate} style={styles.form}>
          <label style={styles.label}>
            Coach instructions (optional)
            <textarea
              value={coachInstructions}
              onChange={(e) => setCoachInstructions(e.target.value)}
              rows={4}
              placeholder="Focus areas, constraints, or preferences for this plan..."
              style={styles.textarea}
            />
          </label>

          <p style={styles.hint}>
            Generates a personalized plan via Anthropic. Review and edit the draft before delivering.
          </p>

          <button type="submit" disabled={generating} style={styles.submitBtn}>
            {generating ? 'Generating draft...' : 'Generate plan draft'}
          </button>
        </form>
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
  container: { maxWidth: 720, margin: '0 auto', padding: '30px 20px' },
  backLink: { display: 'inline-block', color: '#e94560', textDecoration: 'none', marginBottom: 16, fontWeight: 600 },
  title: { margin: '0 0 8px 0', fontSize: 28 },
  subtitle: { color: '#666', margin: '0 0 24px 0' },
  section: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: 24,
  },
  sectionTitle: { margin: '0 0 16px 0', fontSize: 18 },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 },
  infoRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  infoLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  infoValue: { fontSize: 15, fontWeight: 500, color: '#1a1a2e' },
  form: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' },
  label: { display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, fontWeight: 600, color: '#333' },
  textarea: { padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
  hint: { fontSize: 13, color: '#666', margin: '16px 0 0 0' },
  submitBtn: {
    marginTop: 20,
    width: '100%',
    padding: 14,
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    cursor: 'pointer',
    fontWeight: 600,
  },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
  errorBox: { backgroundColor: '#f8d7da', color: '#721c24', padding: 24, borderRadius: 12, textAlign: 'center' },
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
