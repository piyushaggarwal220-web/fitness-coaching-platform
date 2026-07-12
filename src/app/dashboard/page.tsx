'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Map,
  MessageCircle,
  Timer,
} from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Card, StatCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCheckinDate } from '@/lib/checkin';
import { getClientCheckinSchedule } from '@/lib/checkin-schedule';
import { formatPlanDate } from '@/lib/plans';
import { authenticateClient, fetchClientProfile, getOnboardingLabel, isOnboardingComplete } from '@/lib/onboarding';
import { getClientDashboardStatus } from '@/lib/purchase-dashboard';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing } from '@/lib/design-tokens';
import { mobileStyles } from '@/lib/mobile-styles';
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase, Workout } from '@/types/database';

const supabase = createClient();

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [allCheckins, setAllCheckins] = useState<Checkin[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [checkinCount, setCheckinCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      try {
        const result = await authenticateClient(supabase, router, { requirePayment: true });
        if (!result) {
          setLoading(false);
          return;
        }

        let profileData = result.profile

        if (!profileData && !result.profileError) {
          const retry = await fetchClientProfile(supabase, result.user.id)
          profileData = retry.profile
          if (retry.error && !profileData) {
            setLoadError('Could not load your profile. Please refresh the page.')
            setLoading(false)
            return
          }
        }

        if (result.profileError && !profileData) {
          setLoadError('Could not load your profile. Please refresh the page.');
          setLoading(false);
          return;
        }

        if (!profileData) {
          setLoadError('Your profile could not be loaded. Please refresh or log in again.');
          setLoading(false);
          return;
        }

        if (!isOnboardingComplete(profileData)) {
          const retry = await fetchClientProfile(supabase, result.user.id);
          const retryProfile = retry.profile ?? profileData;
          if (!isOnboardingComplete(retryProfile)) {
            router.push('/onboarding');
            setLoading(false);
            return;
          }
          profileData = retryProfile;
        }

        setUser(result.user as User);
        setProfile(profileData);

        const userId = result.user.id;
        const activity: ActivityItem[] = [];

        const { data: checkinData, error: checkinError } = await supabase
          .from('checkins')
          .select('*')
          .eq('client_id', userId)
          .order('submitted_at', { ascending: false });

        if (checkinError) throw new Error(checkinError.message);
        const checkinList = (checkinData ?? []) as Checkin[];
        setAllCheckins(checkinList);
        const latestCheckin = checkinList[0] ?? null;

        const { count: checkinsTotal, error: checkinCountError } = await supabase
          .from('checkins')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', userId);

        if (checkinCountError) throw new Error(checkinCountError.message);
        setCheckinCount(checkinsTotal ?? 0);

        if (latestCheckin) {
          activity.push({
            id: `checkin-${latestCheckin.id}`,
            icon: <ClipboardList size={18} color={colors.accent} />,
            title: `${latestCheckin.checkin_type === 'mid_week' ? 'Day 3' : 'Weekly'} check-in submitted`,
            subtitle: formatCheckinDate(latestCheckin.submitted_at),
          });
        }

        const { data: planData, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('client_id', userId)
          .eq('active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planError) throw new Error(planError.message);
        setActivePlan(planData);

        const { data: purchaseData, error: purchaseError } = await supabase
          .from('purchases')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (purchaseError) throw new Error(purchaseError.message);
        setPurchase(purchaseData);

        const { data: workoutsData, error: workoutsError } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (workoutsError) throw new Error(workoutsError.message);

        const { count: workoutsTotal, error: workoutsCountError } = await supabase
          .from('workouts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (workoutsCountError) throw new Error(workoutsCountError.message);

        const { data: durationRows, error: durationError } = await supabase
          .from('workouts')
          .select('duration')
          .eq('user_id', userId);

        if (durationError) throw new Error(durationError.message);

        const workouts = (workoutsData ?? []) as Workout[];
        setWorkoutCount(workoutsTotal ?? 0);
        setTotalMinutes(
          (durationRows ?? []).reduce((sum, w) => sum + (Number(w.duration) || 0), 0)
        );

        for (const w of workouts.slice(0, 3)) {
          activity.push({
            id: `workout-${w.id}`,
            icon: <Dumbbell size={18} color={colors.accent} />,
            title: `Completed workout — ${w.name}`,
            subtitle: new Date(w.date ?? w.created_at).toLocaleString(),
          });
        }

        setRecentActivity(activity.slice(0, 5));

        if (result.profile?.coach_id) {
          const { data: coachData, error: coachError } = await supabase
            .from('coaches')
            .select('id, name, user_id, hard_cap')
            .eq('id', result.profile.coach_id)
            .maybeSingle();
          if (coachError) throw new Error(coachError.message);
          setCoach(coachData);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  const status = profile
    ? getClientDashboardStatus({ profile, purchase, coach, activePlan })
    : null;

  const latestCheckin = allCheckins[0] ?? null;
  const checkinSchedule = profile?.onboarding_completed_at
    ? getClientCheckinSchedule(profile.onboarding_completed_at, allCheckins)
    : null;

  const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <ClientShell loading={loading}>
      {loadError && (
        <div style={{ ...mobileStyles.error, marginBottom: spacing[4] }}>
          {loadError}
        </div>
      )}

      {/* Greeting */}
      <div style={{ marginBottom: spacing[5] }}>
        <p style={{ margin: 0, fontSize: 15, color: colors.textMuted, fontWeight: 500 }}>Good {getGreeting()}</p>
        <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(1.75rem, 7vw, 2.25rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {firstName}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: colors.textSecondary }}>
          Here&apos;s your coaching overview for today
        </p>
      </div>

      {/* Next check-in countdown */}
      {checkinSchedule?.countdownLabel && (
        <Card variant="glass" style={{ marginBottom: spacing[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Timer size={22} color={colors.accent} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>Next check-in</p>
              <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700, color: colors.textPrimary }}>
                {checkinSchedule.countdownLabel}
              </p>
            </div>
            {checkinSchedule.coachingDay && (
              <span style={{ fontSize: 13, color: colors.textMuted }}>Day {checkinSchedule.coachingDay}</span>
            )}
          </div>
        </Card>
      )}

      {/* Today's Tasks */}
      {checkinSchedule && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Today&apos;s Tasks</h2>
          {checkinSchedule.todayTasks.length === 0 ? (
            <Card variant="elevated">
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                <CheckCircle2 size={20} color={colors.success} />
                <p style={{ margin: 0, color: colors.textSecondary, fontSize: 15 }}>
                  All caught up for today
                </p>
              </div>
            </Card>
          ) : (
            checkinSchedule.todayTasks.map((task) => (
              <Card key={`${task.type}-${task.coachingWeek}`} variant="elevated" style={{ marginBottom: spacing[2] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{task.label}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                      {task.status === 'available' && 'Ready to complete'}
                      {task.status === 'awaiting_review' && 'Awaiting coach review'}
                      {task.status === 'completed' && 'Completed'}
                    </p>
                  </div>
                  {task.status === 'available' && (
                    <Button size="md" onClick={() => router.push(task.href)}>Start</Button>
                  )}
                  {task.status === 'awaiting_review' && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.success, backgroundColor: colors.successMuted, padding: '6px 12px', borderRadius: 999 }}>Done</span>
                  )}
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {/* Current Plan */}
      {profile && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Current Plan</h2>
          <Card
            variant="glass"
            onClick={() => router.push('/plan')}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={22} color={colors.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activePlan ? activePlan.title : profile.plan_delivered ? 'Plan pending activation' : 'Plan in preparation'}
                </p>
                {activePlan && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                    v{activePlan.version} · Updated {formatPlanDate(activePlan.updated_at)}
                  </p>
                )}
              </div>
              <ArrowRight size={20} color={colors.textMuted} />
            </div>
          </Card>
        </section>
      )}

      {/* Coach & status */}
      {status && status.nextAction && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Next Step</h2>
          <Card variant="elevated">
            <p style={{ margin: '0 0 12px', fontSize: 15, color: colors.textSecondary }}>{status.nextAction}</p>
            <Button fullWidth onClick={() => router.push(status.nextActionHref)}>Continue</Button>
          </Card>
        </section>
      )}

      {/* Stats glance */}
      <section style={{ marginBottom: spacing[5] }}>
        <h2 style={sectionHeading}>Progress</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing[2] }}>
          <StatCard label="Workouts" value={String(workoutCount)} icon={<Dumbbell size={18} />} />
          <StatCard label="Minutes" value={String(totalMinutes)} icon={<Timer size={18} />} />
          <StatCard label="Check-ins" value={String(checkinCount)} icon={<Calendar size={18} />} />
        </div>
      </section>

      {/* Journey shortcut */}
      <section style={{ marginBottom: spacing[5] }}>
        <Card variant="elevated" onClick={() => router.push('/journey')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
            <Map size={22} color={colors.accent} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>View your journey</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>Timeline, photos & milestones</p>
            </div>
            <ArrowRight size={20} color={colors.textMuted} />
          </div>
        </Card>
      </section>

      {/* Check-in status */}
      {profile && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Check-in Status</h2>
          <Card variant="elevated">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[4] }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</p>
                <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600 }}>
                  {profile.checkin_awaiting
                    ? 'Awaiting review'
                    : latestCheckin?.reviewed
                      ? 'Reviewed'
                      : latestCheckin
                        ? 'Pending review'
                        : 'No check-ins yet'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next due</p>
                <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600 }}>
                  {checkinSchedule?.nextCheckin
                    ? formatCheckinDate(checkinSchedule.nextCheckin.dueDate.toISOString())
                    : '—'}
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Coach chat shortcut */}
      {coach && (
        <section style={{ marginBottom: spacing[5] }}>
          <Card variant="glass" onClick={() => router.push('/client/chat')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
              <MessageCircle size={22} color={colors.accent} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>Message {coach.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>Your assigned coach</p>
              </div>
              <ArrowRight size={20} color={colors.textMuted} />
            </div>
          </Card>
        </section>
      )}

      {/* Recent activity */}
      <section style={{ marginBottom: spacing[5] }}>
        <h2 style={sectionHeading}>Recent Activity</h2>
        <Card variant="elevated" padding={0} style={{ overflow: 'hidden' }}>
          {recentActivity.length === 0 ? (
            <p style={{ margin: 0, padding: spacing[4], color: colors.textMuted, fontSize: 15 }}>
              No activity yet. Log a workout or submit your first check-in.
            </p>
          ) : (
            recentActivity.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  padding: `${spacing[3]}px ${spacing[4]}px`,
                  borderBottom: i < recentActivity.length - 1 ? `1px solid ${colors.divider}` : 'none',
                }}
              >
                {item.icon}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>{item.subtitle}</p>
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* Onboarding summary — collapsed glance */}
      {profile && (
        <section>
          <h2 style={sectionHeading}>Your Profile</h2>
          <Card variant="elevated">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing[3] }}>
              <GlanceItem label="Goal" value={getOnboardingLabel('fitness_goal', profile.fitness_goal)} />
              <GlanceItem label="Training" value={getOnboardingLabel('training_experience', profile.training_experience)} />
              <GlanceItem label="Weight" value={profile.weight ? `${profile.weight} kg` : '—'} />
              <GlanceItem label="Age" value={profile.age ? `${profile.age} yrs` : '—'} />
            </div>
          </Card>
        </section>
      )}
    </ClientShell>
  );
}

function GlanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const sectionHeading: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 13,
  fontWeight: 600,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
