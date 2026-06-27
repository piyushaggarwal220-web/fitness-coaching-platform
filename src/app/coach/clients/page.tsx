'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import CoachNavbar from '../../components/CoachNavbar';
import { requireCoach } from '@/lib/coach-session';
import {
  coachBadgeStyles,
  formatFitnessGoal,
  getCheckinStatus,
  getPlanStatus,
} from '@/lib/coach-utils';
import type { ClientProfile, Coach } from '@/types/database';

const supabase = createClient();

export default function CoachClientsPage() {
  const router = useRouter();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadClients = async () => {
      setError('');
      const coachData = await requireCoach(supabase, router);
      if (!coachData) return;

      setCoach(coachData);

      const { data: clientsData, error: clientsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('coach_id', coachData.id)
        .order('name', { ascending: true });

      if (clientsError) {
        setError('Failed to load clients. Please try again.');
        setLoading(false);
        return;
      }

      setClients(clientsData ?? []);
      setLoading(false);
    };

    loadClients();
  }, [router]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) => {
      const name = (client.name ?? '').toLowerCase();
      const email = (client.email ?? '').toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [clients, search]);

  if (loading) {
    return (
      <>
        <CoachNavbar />
        <div style={styles.loading}>Loading clients...</div>
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
          <div>
            <h1 style={styles.title}>Clients</h1>
            <p style={styles.subtitle}>
              {coach?.name ? `${coach.name}'s roster` : 'Your assigned clients'} · {clients.length} total
            </p>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            type="search"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.listSection}>
          {clients.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No clients assigned yet</p>
              <p style={styles.emptyText}>When clients are assigned to you, they will appear here.</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyTitle}>No matches found</p>
              <p style={styles.emptyText}>Try a different name or email search.</p>
            </div>
          ) : (
            <div style={styles.clientList}>
              {filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  style={styles.clientCard}
                  onClick={() => router.push(`/coach/client/${client.id}`)}
                >
                  <div style={styles.clientMain}>
                    <div style={styles.clientName}>{client.name || 'Unnamed client'}</div>
                    <div style={styles.clientEmail}>{client.email || 'No email'}</div>
                  </div>
                  <div style={styles.clientMeta}>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Goal</span>
                      <span>{formatFitnessGoal(client.fitness_goal)}</span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Plan</span>
                      <span style={client.plan_delivered ? coachBadgeStyles.delivered : coachBadgeStyles.pending}>
                        {getPlanStatus(client)}
                      </span>
                    </div>
                    <div style={styles.metaItem}>
                      <span style={styles.metaLabel}>Check-in</span>
                      <span style={
                        client.checkin_overdue
                          ? coachBadgeStyles.overdue
                          : client.checkin_awaiting
                            ? coachBadgeStyles.awaiting
                            : coachBadgeStyles.ok
                      }>
                        {getCheckinStatus(client)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' },
  container: { maxWidth: 1200, margin: '0 auto', padding: '30px 20px' },
  header: { marginBottom: 24 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { color: '#666', marginTop: 6 },
  toolbar: { marginBottom: 20 },
  searchInput: {
    width: '100%',
    maxWidth: 420,
    padding: '12px 16px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 16,
    boxSizing: 'border-box',
  },
  listSection: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  clientList: { display: 'flex', flexDirection: 'column', gap: 12 },
  clientCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    border: '1px solid #eee',
    borderRadius: 8,
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  clientMain: { flex: 1 },
  clientName: { fontWeight: 600, fontSize: 16, marginBottom: 4 },
  clientEmail: { color: '#666', fontSize: 14 },
  clientMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  },
  metaItem: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 },
  metaLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  empty: { textAlign: 'center', padding: '48px 20px' },
  emptyTitle: { fontWeight: 600, fontSize: 18, marginBottom: 8, color: '#333' },
  emptyText: { color: '#666', margin: 0 },
  errorBox: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: 24,
    borderRadius: 12,
    textAlign: 'center',
  },
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
