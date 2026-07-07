'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import CoachNavbar from '../../components/CoachNavbar';
import { createClient } from '@/lib/supabase/client';
import { requireCoach } from '@/lib/coach-session';
import type { ClientProfile, Coach, CoachStats } from '@/types/database';

const supabase = createClient();

export default function CoachDashboard() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<CoachStats>({ total: 0, awaiting: 0, overdue: 0, new: 0 });
  const [pendingCheckins, setPendingCheckins] = useState(0);
  const [plansDelivered, setPlansDelivered] = useState(0);

  useEffect(() => {
    const checkCoach = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('coach_id', coachData.id);

      if (clientsError) {
        setError('Failed to load dashboard data. Please try again.');
        setLoading(false);
        return;
      }

      if (clientsData) {
        setClients(clientsData);
        const total = clientsData.length;
        const awaiting = clientsData.filter(c => c.checkin_awaiting === true).length;
        const overdue = clientsData.filter(c => c.checkin_overdue === true).length;
        const newClients = clientsData.filter(c => c.plan_delivered === false).length;
        setStats({ total, awaiting, overdue, new: newClients });
      }

      const { count, error: checkinsError } = await supabase
        .from('checkins')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('reviewed', false);

      if (checkinsError) {
        setError('Failed to load check-in counts.');
        setLoading(false);
        return;
      }

      setPendingCheckins(count ?? 0);

      const { count: activePlanCount, error: plansError } = await supabase
        .from('plans')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachData.id)
        .eq('active', true);

      if (plansError) {
        setError('Failed to load plan counts.');
        setLoading(false);
        return;
      }

      setPlansDelivered(activePlanCount ?? 0);
      setLoading(false);
    };
    checkCoach();
  }, [router]);

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading coach dashboard...</div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{error}</p>
            <button style={styles.retryBtn} onClick={() => window.location.reload()}>
              Retry
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
        <div style={styles.header}>
          <h1>Coach Dashboard</h1>
          <p style={styles.subtitle}>Welcome back, {coach?.name || 'Coach'}!</p>
        </div>

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statNumber}>{stats.total}</div>
            <div style={styles.statLabel}>Total Clients</div>
            <div style={styles.statSub}>{stats.total}/{coach?.hard_cap || 500} capacity</div>
          </div>
          <div style={{...styles.statCard, borderLeft: '4px solid #e94560'}}>
            <div style={styles.statNumber}>{stats.awaiting}</div>
            <div style={styles.statLabel}>Awaiting Response</div>
          </div>
          <div style={{...styles.statCard, borderLeft: '4px solid #f0a030'}}>
            <div style={styles.statNumber}>{stats.overdue}</div>
            <div style={styles.statLabel}>Overdue Check-ins</div>
          </div>
          <div style={{...styles.statCard, borderLeft: '4px solid #1a4a8a'}}>
            <div style={styles.statNumber}>{stats.new}</div>
            <div style={styles.statLabel}>New Clients</div>
          </div>
        </div>

        <div style={styles.statsGrid}>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard, borderLeft: '4px solid #28a745' }} onClick={() => router.push('/coach/clients?tier=low')}>
            <div style={styles.statNumber}>{clients.filter((c) => c.complexity_tier === 'low').length}</div>
            <div style={styles.statLabel}>Low Complexity</div>
          </button>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard, borderLeft: '4px solid #ffc107' }} onClick={() => router.push('/coach/clients?tier=medium')}>
            <div style={styles.statNumber}>{clients.filter((c) => c.complexity_tier === 'medium').length}</div>
            <div style={styles.statLabel}>Medium Complexity</div>
          </button>
          <button type="button" style={{ ...styles.statCard, ...styles.complexityCard, borderLeft: '4px solid #dc3545' }} onClick={() => router.push('/coach/clients?tier=high')}>
            <div style={styles.statNumber}>{clients.filter((c) => c.complexity_tier === 'high').length}</div>
            <div style={styles.statLabel}>High Complexity</div>
          </button>
        </div>

        <div style={styles.checkinBanner}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Pending check-in reviews</h2>
            <p style={{ margin: '6px 0 0 0', color: '#666' }}>
              {pendingCheckins === 0 ? 'All caught up!' : `${pendingCheckins} check-in${pendingCheckins === 1 ? '' : 's'} waiting for review`}
            </p>
          </div>
          <button style={styles.checkinBtn} onClick={() => router.push('/coach/checkins')}>
            Review check-ins
          </button>
        </div>

        <div style={{ ...styles.checkinBanner, borderLeftColor: '#1a1a2e' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Active plans delivered</h2>
            <p style={{ margin: '6px 0 0 0', color: '#666' }}>
              {plansDelivered} client{plansDelivered === 1 ? '' : 's'} with an active plan
            </p>
          </div>
          <button style={{ ...styles.checkinBtn, backgroundColor: '#1a1a2e' }} onClick={() => router.push('/coach/plans')}>
            Manage plans
          </button>
        </div>

        <div style={styles.queueSection}>
          <h2>Client Queue</h2>

          <div style={styles.clientList}>
            {clients.length === 0 ? (
              <p style={styles.empty}>No clients assigned yet.</p>
            ) : (
              clients.map((client) => (
                <div key={client.id} style={styles.clientCard}>
                  <div style={styles.clientInfo}>
                    <div style={styles.clientName}>{client.name || client.email}</div>
                    <div style={styles.clientStatus}>
                      {client.complexity_score != null && client.complexity_tier && (
                        <span style={{
                          backgroundColor: client.complexity_tier === 'low' ? '#d4edda' : client.complexity_tier === 'medium' ? '#fff3cd' : '#f8d7da',
                          color: client.complexity_tier === 'low' ? '#155724' : client.complexity_tier === 'medium' ? '#856404' : '#721c24',
                          padding: '2px 10px', borderRadius: 12, fontSize: 12,
                        }}>
                          {client.complexity_score}/100
                        </span>
                      )}
                      {client.checkin_overdue && <span style={styles.badgeOverdue}>Overdue</span>}
                      {client.checkin_awaiting && <span style={styles.badgeAwaiting}>Awaiting</span>}
                      {!client.plan_delivered && <span style={styles.badgeNew}>New</span>}
                      {!client.checkin_overdue && !client.checkin_awaiting && client.plan_delivered &&
                        <span style={styles.badgeOk}>✓ OK</span>
                      }
                    </div>
                  </div>
                  <div style={styles.clientActions}>
                    <button style={styles.actionBtn} onClick={() => router.push(`/coach/client/${client.id}`)}>
                      View Profile
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 1200, margin: '0 auto', padding: '30px 20px' },
  header: { marginBottom: 30 },
  subtitle: { color: '#666' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 30 },
  statCard: { backgroundColor: 'white', padding: 20, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', borderLeft: '4px solid #1a1a2e' },
  complexityCard: { cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none' },
  statNumber: { fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 800, color: '#1a1a2e' },
  statLabel: { fontSize: 14, color: '#666' },
  statSub: { fontSize: 12, color: '#999', marginTop: 4 },
  queueSection: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  clientList: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 },
  clientCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, border: '1px solid #eee', borderRadius: 8 },
  clientInfo: { flex: 1 },
  clientName: { fontWeight: 600, marginBottom: 4 },
  clientStatus: { display: 'flex', gap: 8 },
  badgeOverdue: { backgroundColor: '#f8d7da', color: '#721c24', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  badgeAwaiting: { backgroundColor: '#fff3cd', color: '#856404', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  badgeNew: { backgroundColor: '#cce5ff', color: '#004085', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  badgeOk: { backgroundColor: '#d4edda', color: '#155724', padding: '2px 10px', borderRadius: 12, fontSize: 12 },
  clientActions: { display: 'flex', gap: 10 },
  actionBtn: { padding: '8px 16px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
  empty: { textAlign: 'center', color: '#666', padding: '40px 0' },
  checkinBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    marginBottom: 24,
    borderLeft: '4px solid #e94560',
  },
  checkinBtn: { padding: '10px 20px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 },
  errorBox: { backgroundColor: '#f8d7da', color: '#721c24', padding: 24, borderRadius: 12, textAlign: 'center' },
  errorText: { margin: '0 0 16px 0' },
  retryBtn: { padding: '10px 20px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
};
