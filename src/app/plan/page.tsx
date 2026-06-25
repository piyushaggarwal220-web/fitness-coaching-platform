'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { formatPlanDate } from '@/lib/plans';
import { authenticateClient } from '@/lib/onboarding';
import type { Plan } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ClientPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) return;

      const { data, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('client_id', result.user.id)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (planError) {
        setError('Failed to load your plan.');
        setLoading(false);
        return;
      }

      setPlan(data);
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={styles.loading}>Loading your plan...</div>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <Navbar />
        <div style={styles.container}>
          <div style={styles.empty}>
            <h1 style={styles.emptyTitle}>No active plan yet</h1>
            <p style={styles.emptyText}>Your coach is preparing your personalised plan. Check back soon.</p>
            <button style={styles.backBtn} onClick={() => router.push('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div style={styles.page}>
        <div style={styles.hero}>
          <p style={styles.eyebrow}>Your coaching plan</p>
          <h1 style={styles.title}>{plan.title}</h1>
          {plan.phase && <p style={styles.phase}>{plan.phase}</p>}
          <div style={styles.metaRow}>
            <span style={styles.metaBadge}>Version {plan.version}</span>
            <span style={styles.metaText}>Updated {formatPlanDate(plan.updated_at)}</span>
            {plan.delivered_at && (
              <span style={styles.metaText}>Delivered {formatPlanDate(plan.delivered_at)}</span>
            )}
          </div>
        </div>

        <div style={styles.sections}>
          <PlanSection title="Workout plan" icon="🏋️" content={plan.workout_plan} accent="#e94560" />
          <PlanSection title="Nutrition plan" icon="🥗" content={plan.nutrition_plan} accent="#28a745" />
          <PlanSection title="Cardio plan" icon="🏃" content={plan.cardio_plan} accent="#1a4a8a" />
          <PlanSection title="Supplements" icon="💊" content={plan.supplement_plan} accent="#6f42c1" />
          {plan.coach_notes && (
            <PlanSection title="Coach notes" icon="📝" content={plan.coach_notes} accent="#1a1a2e" />
          )}
        </div>
      </div>
    </>
  );
}

function PlanSection({ title, icon, content, accent }: { title: string; icon: string; content: string | null; accent: string }) {
  if (!content?.trim()) return null;

  return (
    <section style={{ ...styles.section, borderLeftColor: accent }}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionIcon}>{icon}</span>
        <h2 style={styles.sectionTitle}>{title}</h2>
      </div>
      <div style={styles.sectionBody}>{content}</div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  page: { maxWidth: 800, margin: '0 auto', padding: '30px 20px 60px' },
  container: { maxWidth: 600, margin: '0 auto', padding: '60px 20px' },
  hero: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: 'white',
    padding: '36px 28px',
    borderRadius: 16,
    marginBottom: 28,
  },
  eyebrow: { margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 2, color: '#e94560', fontWeight: 700 },
  title: { margin: '8px 0 0 0', fontSize: 32, lineHeight: 1.2 },
  phase: { margin: '8px 0 0 0', color: '#ccc', fontSize: 16 },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20, alignItems: 'center' },
  metaBadge: { backgroundColor: '#e94560', padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 },
  metaText: { fontSize: 13, color: '#aaa' },
  sections: { display: 'flex', flexDirection: 'column', gap: 20 },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: '24px 24px 24px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    borderLeft: '4px solid',
  },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionIcon: { fontSize: 24 },
  sectionTitle: { margin: 0, fontSize: 20, color: '#1a1a2e' },
  sectionBody: { whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#333', fontSize: 15 },
  empty: { textAlign: 'center', backgroundColor: 'white', padding: 48, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' },
  emptyTitle: { margin: '0 0 12px 0', fontSize: 24 },
  emptyText: { color: '#666', margin: '0 0 24px 0' },
  backBtn: { padding: '12px 24px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15 },
};
