'use client';

import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { formatCheckinDate, getNextCheckinDate, isCheckinDue } from '@/lib/checkin';
import { formatPlanDate } from '@/lib/plans';
import { authenticateClient, getOnboardingLabel } from '@/lib/onboarding';
import { getClientDashboardStatus } from '@/lib/purchase-dashboard';
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [latestCheckin, setLatestCheckin] = useState<Checkin | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats] = useState({ workouts: 12, streak: 5, progress: 78 });

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) return;

      setUser(result.user as User);
      setProfile(result.profile);

      const { data: checkinData } = await supabase
        .from('checkins')
        .select('*')
        .eq('client_id', result.user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setLatestCheckin(checkinData);

      const { data: planData } = await supabase
        .from('plans')
        .select('*')
        .eq('client_id', result.user.id)
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActivePlan(planData);

      const { data: purchaseData } = await supabase
        .from('purchases')
        .select('*')
        .eq('user_id', result.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setPurchase(purchaseData);

      if (result.profile?.coach_id) {
        const { data: coachData } = await supabase
          .from('coaches')
          .select('id, name, user_id, hard_cap')
          .eq('id', result.profile.coach_id)
          .maybeSingle();
        setCoach(coachData);
      }

      setLoading(false);
    };
    checkUser();
  }, [router]);

  if (loading) {
    return (
      <>
        <Navbar />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 20, color: '#666' }}>
          Loading...
        </div>
      </>
    );
  }

  const status = profile
    ? getClientDashboardStatus({ profile, purchase, coach, activePlan })
    : null;

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '30px 20px' }}>
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32 }}>Welcome back, {profile?.name || user?.email || 'User'}!</h1>
          <p style={{ color: '#666' }}>Here&apos;s your fitness summary for today</p>
        </div>

        {status && (
          <div style={statusStyles.card}>
            <h2 style={statusStyles.title}>Your coaching journey</h2>
            <div style={statusStyles.grid}>
              <StatusItem label="Payment" value={status.paymentConfirmed ? 'Confirmed ✓' : 'Pending'} ok={status.paymentConfirmed} />
              <StatusItem label="Onboarding" value={status.onboardingComplete ? 'Complete ✓' : 'Incomplete'} ok={status.onboardingComplete} />
              <StatusItem
                label="Coach"
                value={status.coachAssigned ? status.coachName ?? 'Assigned' : 'Assigning soon'}
                ok={status.coachAssigned}
              />
              <StatusItem label="Plan" value={status.planStatus} ok={Boolean(activePlan)} />
            </div>
            {status.expectedDelivery && (
              <p style={statusStyles.delivery}>Expected plan delivery by: <strong>{status.expectedDelivery}</strong></p>
            )}
            <div style={statusStyles.next}>
              <p style={statusStyles.nextLabel}>Next action</p>
              <p style={statusStyles.nextValue}>{status.nextAction}</p>
              <button onClick={() => router.push(status.nextActionHref)} style={statusStyles.nextBtn}>
                Go
              </button>
            </div>
          </div>
        )}

        {profile && (
          <div style={checkinStyles.card}>
            <h2 style={checkinStyles.title}>Weekly check-in</h2>
            <div style={checkinStyles.row}>
              <div>
                <p style={checkinStyles.statusLabel}>Status</p>
                <p style={checkinStyles.statusValue}>
                  {profile.checkin_awaiting
                    ? 'Awaiting coach review'
                    : latestCheckin?.reviewed
                      ? 'Last check-in reviewed'
                      : latestCheckin
                        ? 'Submitted — pending review'
                        : 'No check-ins yet'}
                </p>
                {latestCheckin && (
                  <p style={checkinStyles.meta}>Last submitted: {formatCheckinDate(latestCheckin.submitted_at)}</p>
                )}
              </div>
              <div>
                <p style={checkinStyles.statusLabel}>Next check-in</p>
                <p style={checkinStyles.statusValue}>
                  {isCheckinDue(latestCheckin?.submitted_at ?? null)
                    ? 'Due now'
                    : formatCheckinDate(getNextCheckinDate(latestCheckin?.submitted_at ?? null).toISOString())}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/checkin')}
              style={checkinStyles.btn}
            >
              {isCheckinDue(latestCheckin?.submitted_at ?? null) ? 'Submit check-in' : 'View / submit early'}
            </button>
          </div>
        )}

        {profile && (
          <div style={planStyles.card}>
            <h2 style={planStyles.title}>Your coaching plan</h2>
            <p style={planStyles.status}>
              {activePlan
                ? `${activePlan.title} · v${activePlan.version}`
                : profile.plan_delivered
                  ? 'Plan pending activation'
                  : 'No plan delivered yet'}
            </p>
            {activePlan && (
              <p style={planStyles.meta}>Last updated {formatPlanDate(activePlan.updated_at)}</p>
            )}
            <button onClick={() => router.push('/plan')} style={planStyles.btn}>
              {activePlan ? 'View full plan' : 'Check plan status'}
            </button>
          </div>
        )}

        {profile && (
          <div style={summaryStyles.card}>
            <h2 style={summaryStyles.title}>Your onboarding profile</h2>
            <div style={summaryStyles.grid}>
              <SummaryItem label="Goal" value={getOnboardingLabel('fitness_goal', profile.fitness_goal)} />
              <SummaryItem label="Training" value={getOnboardingLabel('training_experience', profile.training_experience)} />
              <SummaryItem label="Activity" value={getOnboardingLabel('activity_level', profile.activity_level)} />
              <SummaryItem label="Diet" value={getOnboardingLabel('diet_preference', profile.diet_preference)} />
              <SummaryItem label="Sleep" value={getOnboardingLabel('sleep_duration', profile.sleep_duration)} />
              <SummaryItem label="Age / Weight" value={`${profile.age ?? '—'} yrs · ${profile.weight ?? '—'} kg`} />
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 30 }}>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏋️</div>
            <h3 style={{ margin: 0 }}>{stats.workouts}</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Total Workouts</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🔥</div>
            <h3 style={{ margin: 0 }}>{stats.streak}</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Day Streak</p>
          </div>
          <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📈</div>
            <h3 style={{ margin: 0 }}>{stats.progress}%</h3>
            <p style={{ margin: '5px 0 0 0', color: '#666' }}>Progress</p>
          </div>
        </div>

        <div style={{ marginBottom: 30 }}>
          <h2>Quick Actions</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15, marginTop: 15 }}>
            <button 
              onClick={() => router.push('/workouts')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              ➕ Log Workout
            </button>
            <button 
              onClick={() => router.push('/progress')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              📊 View Progress
            </button>
            <button 
              onClick={() => router.push('/checkin')} 
              style={{ padding: 15, backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              📋 Weekly Check-In
            </button>
            <button 
              onClick={() => router.push('/profile')} 
              style={{ padding: 15, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
              👤 Update Profile
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: 25, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h2>Recent Activity</h2>
          <div style={{ marginTop: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 20 }}>🟢</span>
              <div>
                <p style={{ margin: 0 }}><strong>Completed workout</strong> - Upper Body</p>
                <small style={{ color: '#666' }}>2 hours ago</small>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '12px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 20 }}>🟡</span>
              <div>
                <p style={{ margin: 0 }}><strong>Updated profile</strong> - Fitness goal set</p>
                <small style={{ color: '#666' }}>1 day ago</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryStyles.item}>
      <span style={summaryStyles.itemLabel}>{label}</span>
      <span style={summaryStyles.itemValue}>{value}</span>
    </div>
  );
}

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={statusStyles.item}>
      <span style={statusStyles.itemLabel}>{label}</span>
      <span style={{ ...statusStyles.itemValue, color: ok ? '#155724' : '#856404' }}>{value}</span>
    </div>
  );
}

const statusStyles: Record<string, React.CSSProperties> = {
  card: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: 24, borderLeft: '4px solid #C9A227' },
  title: { margin: '0 0 16px 0', fontSize: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 },
  item: { display: 'flex', flexDirection: 'column', gap: 4 },
  itemLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase' },
  itemValue: { fontSize: 15, fontWeight: 600 },
  delivery: { margin: '0 0 16px 0', color: '#666', fontSize: 14 },
  next: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid #eee' },
  nextLabel: { margin: 0, fontSize: 12, color: '#999', textTransform: 'uppercase', width: '100%' },
  nextValue: { margin: 0, flex: 1, fontSize: 16, fontWeight: 600 },
  nextBtn: { padding: '10px 18px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 },
};

const summaryStyles: Record<string, React.CSSProperties> = {
  card: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: 24 },
  title: { margin: '0 0 16px 0', fontSize: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 },
  item: { display: 'flex', flexDirection: 'column', gap: 4 },
  itemLabel: { fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' },
  itemValue: { fontSize: 15, fontWeight: 600, color: '#1a1a2e' },
};

const checkinStyles: Record<string, React.CSSProperties> = {
  card: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: 24, borderLeft: '4px solid #e94560' },
  title: { margin: '0 0 16px 0', fontSize: 20 },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 16 },
  statusLabel: { margin: 0, fontSize: 12, color: '#999', textTransform: 'uppercase' },
  statusValue: { margin: '4px 0 0 0', fontSize: 16, fontWeight: 600 },
  meta: { margin: '4px 0 0 0', fontSize: 13, color: '#666' },
  btn: { padding: '12px 20px', backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600 },
};

const planStyles: Record<string, React.CSSProperties> = {
  card: { backgroundColor: 'white', padding: 24, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: 24, borderLeft: '4px solid #1a1a2e' },
  title: { margin: '0 0 12px 0', fontSize: 20 },
  status: { margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: '#1a1a2e' },
  meta: { margin: '0 0 16px 0', fontSize: 13, color: '#666' },
  btn: { padding: '12px 20px', backgroundColor: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600 },
};
