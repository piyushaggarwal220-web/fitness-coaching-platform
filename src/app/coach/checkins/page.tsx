'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import CoachNavbar from '../../components/CoachNavbar';
import { formatCheckinDate } from '@/lib/checkin';
import type { CheckinWithClient, Coach } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Tab = 'pending' | 'reviewed';

export default function CoachCheckinsPage() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [checkins, setCheckins] = useState<CheckinWithClient[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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

      const { data, error: checkinsError } = await supabase
        .from('checkins')
        .select('*, profiles:client_id(name, email)')
        .eq('coach_id', coachData.id)
        .order('submitted_at', { ascending: false });

      if (checkinsError) {
        setError('Failed to load check-ins.');
        setLoading(false);
        return;
      }

      setCheckins((data as CheckinWithClient[]) ?? []);
      setLoading(false);
    };
    load();
  }, [router]);

  const clients = useMemo(() => {
    const names = new Map<string, string>();
    checkins.forEach((c) => {
      const label = c.profiles?.name || c.profiles?.email || c.client_id;
      names.set(c.client_id, label);
    });
    return Array.from(names.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [checkins]);

  const filtered = useMemo(() => {
    return checkins.filter((c) => {
      const matchesTab = tab === 'pending' ? !c.reviewed : c.reviewed;
      const matchesClient = !clientFilter || c.client_id === clientFilter;
      return matchesTab && matchesClient;
    });
  }, [checkins, tab, clientFilter]);

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading check-ins...</div>
      </>
    );
  }

  return (
    <>
      <CoachNavbar />
      <div style={styles.container}>
        <h1 style={styles.title}>Check-ins</h1>
        <p style={styles.subtitle}>{coach?.name ? `${coach.name}'s queue` : 'Review client progress'}</p>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.toolbar}>
          <div style={styles.tabs}>
            <button type="button" style={{ ...styles.tab, ...(tab === 'pending' ? styles.tabActive : {}) }} onClick={() => setTab('pending')}>
              Pending ({checkins.filter((c) => !c.reviewed).length})
            </button>
            <button type="button" style={{ ...styles.tab, ...(tab === 'reviewed' ? styles.tabActive : {}) }} onClick={() => setTab('reviewed')}>
              Reviewed ({checkins.filter((c) => c.reviewed).length})
            </button>
          </div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} style={styles.select}>
            <option value="">All clients</option>
            {clients.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div style={styles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No {tab} check-ins</p>
              <p style={styles.emptyText}>
                {tab === 'pending' ? 'You are all caught up!' : 'Reviewed check-ins will appear here.'}
              </p>
            </div>
          ) : (
            filtered.map((checkin) => (
              <button
                key={checkin.id}
                type="button"
                style={styles.card}
                onClick={() => router.push(`/coach/checkin/${checkin.id}`)}
              >
                <div>
                  <div style={styles.clientName}>{checkin.profiles?.name || checkin.profiles?.email || 'Client'}</div>
                  <div style={styles.meta}>
                    {formatCheckinDate(checkin.submitted_at)} · {checkin.weight} kg · Waist {checkin.waist} cm
                  </div>
                </div>
                <span style={checkin.reviewed ? styles.badgeReviewed : styles.badgePending}>
                  {checkin.reviewed ? 'Reviewed' : 'Pending'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 900, margin: '0 auto', padding: '30px 20px' },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6, marginBottom: 24 },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20, alignItems: 'center' },
  tabs: { display: 'flex', gap: 8 },
  tab: { padding: '10px 18px', border: '1px solid #ddd', borderRadius: 8, backgroundColor: 'white', cursor: 'pointer', fontSize: 14 },
  tabActive: { backgroundColor: '#1a1a2e', color: 'white', borderColor: '#1a1a2e' },
  select: { padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, minWidth: 180 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    backgroundColor: 'white',
    border: '1px solid #eee',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    flexWrap: 'wrap',
  },
  clientName: { fontWeight: 600, fontSize: 16, marginBottom: 4 },
  meta: { fontSize: 14, color: '#666' },
  badgePending: { backgroundColor: '#fff3cd', color: '#856404', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  badgeReviewed: { backgroundColor: '#d4edda', color: '#155724', padding: '4px 12px', borderRadius: 12, fontSize: 12 },
  empty: { textAlign: 'center', padding: '48px 20px', backgroundColor: 'white', borderRadius: 12 },
  emptyTitle: { fontWeight: 600, fontSize: 18, marginBottom: 8 },
  emptyText: { color: '#666', margin: 0 },
  error: { backgroundColor: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 },
};
