'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { PromptImportPanel } from '@/components/admin/PromptImportPanel'
import { isDevToolkitEnabledClient } from '@/lib/dev-mode';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type EntityClient = { id: string; name: string | null; email: string | null; coach_id: string | null };
type EntityCoach = { id: string; name: string | null; user_id: string };

type LogEntry = { time: string; type: 'success' | 'error'; message: string; detail?: string };

export default function DevToolsClient() {
  const router = useRouter();
  const [clients, setClients] = useState<EntityClient[]>([]);
  const [coaches, setCoaches] = useState<EntityCoach[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastCredentials, setLastCredentials] = useState('');

  const addLog = (type: LogEntry['type'], message: string, detail?: string) => {
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), type, message, detail },
      ...prev,
    ].slice(0, 20));
  };

  const loadEntities = useCallback(async () => {
    const res = await fetch('/api/dev/seed')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to load entities')
    setClients((json.data?.clients as EntityClient[]) ?? [])
    setCoaches((json.data?.coaches as EntityCoach[]) ?? [])
  }, [])

  useEffect(() => {
    if (!isDevToolkitEnabledClient()) {
      router.replace('/')
      return
    }

    const init = async () => {
      try {
        await loadEntities()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          addLog('success', `Signed in as ${user.email}`)
        } else {
          addLog('success', 'Dev toolkit ready (use panel or sign in to test auth flows)')
        }
      } catch (err) {
        addLog('error', err instanceof Error ? err.message : 'Init failed')
      }
      setLoading(false)
    }
    init()
  }, [router, loadEntities])

  const runAction = async (
    action: string,
    payload: Record<string, string> = {}
  ) => {
    setBusy(action)
    try {
      const res = await fetch('/api/dev/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Action failed')

      addLog('success', json.message, JSON.stringify(json.data, null, 2))

      if (json.data?.email && json.data?.password) {
        setLastCredentials(`Email: ${json.data.email}\nPassword: ${json.data.password}`)
      }
      if (json.data?.clientId) setSelectedClientId(json.data.clientId as string)
      if (json.data?.coachId) setSelectedCoachId(json.data.coachId as string)
      if (json.data?.planId) setSelectedPlanId(json.data.planId as string)

      await loadEntities()
    } catch (err) {
      addLog('error', err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <div style={styles.page}><p>Loading dev tools...</p></div>
  }

  return (
    <div style={styles.page}>
      <div style={styles.banner}>
        <strong>DEV MODE</strong> — Local development toolkit. Razorpay unchanged in production.
      </div>

      <h1 style={styles.title}>Development Testing Toolkit</h1>
      <p style={styles.subtitle}>Seed test data for end-to-end flows without Razorpay.</p>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick create</h2>
        <div style={styles.btnGrid}>
          <ActionButton label="Create Test Client" busy={busy} action="create_test_client" onRun={() => runAction('create_test_client')} />
          <ActionButton label="Create Test Coach" busy={busy} action="create_test_coach" onRun={() => runAction('create_test_coach')} />
        </div>
        {lastCredentials && (
          <pre style={styles.credentials}>{lastCredentials}</pre>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Target selection</h2>
        <div style={styles.row}>
          <label style={styles.label}>
            Client
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={styles.select}>
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.email || c.id}</option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Coach
            <select value={selectedCoachId} onChange={(e) => setSelectedCoachId(e.target.value)} style={styles.select}>
              <option value="">Select coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            Plan ID (for activate)
            <input
              type="text"
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              placeholder="From create sample plan log"
              style={styles.input}
            />
          </label>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Workflow actions</h2>
        <div style={styles.btnGrid}>
          <ActionButton
            label="Assign Client To Coach"
            busy={busy}
            action="assign_client_to_coach"
            onRun={() => runAction('assign_client_to_coach', { clientId: selectedClientId, coachId: selectedCoachId })}
            disabled={!selectedClientId || !selectedCoachId}
          />
          <ActionButton
            label="Mark Onboarding Complete"
            busy={busy}
            action="mark_onboarding_complete"
            onRun={() => runAction('mark_onboarding_complete', { clientId: selectedClientId })}
            disabled={!selectedClientId}
          />
          <ActionButton
            label="Create Sample Check-In"
            busy={busy}
            action="create_sample_checkin"
            onRun={() => runAction('create_sample_checkin', { clientId: selectedClientId, coachId: selectedCoachId })}
            disabled={!selectedClientId || !selectedCoachId}
          />
          <ActionButton
            label="Create Sample Plan"
            busy={busy}
            action="create_sample_plan"
            onRun={() => runAction('create_sample_plan', { clientId: selectedClientId, coachId: selectedCoachId })}
            disabled={!selectedClientId || !selectedCoachId}
          />
          <ActionButton
            label="Activate Sample Plan"
            busy={busy}
            action="activate_sample_plan"
            onRun={() => runAction('activate_sample_plan', { planId: selectedPlanId })}
            disabled={!selectedPlanId}
          />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Prompt Library import</h2>
        <PromptImportPanel endpoint="/api/dev/prompt-import" />
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Activity log</h2>
        {logs.length === 0 ? (
          <p style={styles.muted}>No actions yet.</p>
        ) : (
          <div style={styles.logList}>
            {logs.map((log, i) => (
              <div key={i} style={{ ...styles.logItem, borderLeftColor: log.type === 'success' ? '#28a745' : '#dc3545' }}>
                <div style={styles.logHeader}>
                  <span style={styles.logTime}>{log.time}</span>
                  <span style={styles.logMessage}>{log.message}</span>
                </div>
                {log.detail && <pre style={styles.logDetail}>{log.detail}</pre>}
              </div>
            ))}
          </div>
        )}
      </section>

      <p style={styles.footer}>
        Requires <code>npm run dev</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>. See TESTING_GUIDE.md.
      </p>
    </div>
  )
}

function ActionButton({
  label,
  action,
  busy,
  onRun,
  disabled,
}: {
  label: string
  action: string
  busy: string | null
  onRun: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled || (busy !== null && busy !== action)}
      style={{
        ...styles.btn,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {busy === action ? 'Working...' : label}
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '30px 20px 60px', fontFamily: 'system-ui, sans-serif' },
  banner: { backgroundColor: '#fff3cd', color: '#856404', padding: '12px 16px', borderRadius: 8, marginBottom: 24, textAlign: 'center' },
  title: { margin: '0 0 8px 0', fontSize: 28 },
  subtitle: { color: '#666', marginTop: 0, marginBottom: 28 },
  section: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', marginBottom: 20 },
  sectionTitle: { margin: '0 0 16px 0', fontSize: 18 },
  btnGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  btn: { padding: '14px 16px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500 },
  select: { padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  input: { padding: 10, border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  credentials: { marginTop: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, fontSize: 13, overflow: 'auto' },
  logList: { display: 'flex', flexDirection: 'column', gap: 10 },
  logItem: { padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, borderLeft: '4px solid' },
  logHeader: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  logTime: { color: '#999', fontSize: 12 },
  logMessage: { fontWeight: 600, fontSize: 14 },
  logDetail: { margin: '8px 0 0 0', fontSize: 11, overflow: 'auto', whiteSpace: 'pre-wrap' },
  muted: { color: '#666', margin: 0 },
  footer: { fontSize: 13, color: '#666', marginTop: 24 },
}
