'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
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
import { getClientCheckinSchedule, getCheckinStatusLabel, getCheckinTypeDisplayName } from '@/lib/checkin-schedule';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { formatPlanDate } from '@/lib/plans';
import { authenticateClient, getOnboardingLabel } from '@/lib/onboarding';
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore';
import { PlanCountdownCard } from '@/components/dashboard/PlanCountdown';
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
  const [restoringSession, setRestoringSession] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      try {
        const result = await authenticateClient(supabase, router, { requirePayment: true });
        setRestoringSession(false);
        if (!result) {
          setLoading(false);
          return;
        }

        const profileData = result.profile;

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
  const checkinScheduleBypass = shouldBypassCheckinScheduleClient();
  const checkinSchedule = profile?.onboarding_completed_at
    ? getClientCheckinSchedule(profile.onboarding_completed_at, allCheckins, new Date(), {
        bypassSchedule: checkinScheduleBypass,
      })
    : null;

  const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <ClientShell
      loading={loading}
      loadingMessage={restoringSession ? SESSION_RESTORE_MESSAGE : undefined}
    >
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

      {checkinScheduleBypass && (
        <DevelopmentModeBadge style={{ marginBottom: spacing[4] }} />
      )}

      {/* Plan delivery countdown */}
      {profile && status?.onboardingComplete && status.coachAssigned && (
        <PlanCountdownCard profile={profile} activePlan={activePlan} />
      )}

      {/* Coaching week + next check-in */}
      {checkinSchedule?.developmentScheduleMessage ? (
        <Card variant="glass" style={{ marginBottom: spacing[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.warningMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Timer size={22} color={colors.warning} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>Development Mode</p>
              <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 600, color: colors.textPrimary }}>
                {checkinSchedule.developmentScheduleMessage}
              </p>
            </div>
          </div>
        </Card>
      ) : checkinSchedule ? (
        <Card variant="glass" style={{ marginBottom: spacing[4] }}>
          <div style={{ display: 'grid', gap: spacing[3] }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Current Coaching Week
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: colors.textPrimary }}>
                Week {checkinSchedule.activeCoachingWeek}
              </p>
            </div>
            {checkinSchedule.nextCheckin && (
              <>
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Next Check-in
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>
                    {getCheckinTypeDisplayName(checkinSchedule.nextCheckin.type)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textSecondary }}>
                    Week {checkinSchedule.nextCheckin.coachingWeek} · Day {checkinSchedule.nextCheckin.coachingDay}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Timer size={20} color={colors.accent} />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontWeight: 500 }}>
                      {checkinSchedule.nextCheckinStatus === 'available'
                        ? 'Available today'
                        : checkinSchedule.nextCheckinStatus === 'missed'
                          ? 'Overdue — complete now'
                          : 'Available in'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
                      {checkinSchedule.nextCheckinStatus === 'available' || checkinSchedule.nextCheckinStatus === 'missed'
                        ? 'Now'
                        : checkinSchedule.countdownDetailed ?? checkinSchedule.countdownLabel ?? 'Soon'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      ) : null}

      {/* Active week check-in status */}
      {checkinSchedule && checkinSchedule.weekCheckins.length > 0 && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>This Week&apos;s Check-ins</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[2] }}>
            {checkinSchedule.weekCheckins.map((task) => {
              const statusColor =
                task.status === 'completed' ? colors.success :
                task.status === 'available' ? colors.accent :
                task.status === 'missed' ? colors.danger :
                task.status === 'awaiting_review' ? colors.warning :
                colors.textMuted
              const statusBg =
                task.status === 'completed' ? colors.successMuted :
                task.status === 'available' ? colors.accentMuted :
                task.status === 'missed' ? colors.dangerMuted :
                task.status === 'awaiting_review' ? colors.warningMuted :
                colors.bgElevated

              return (
                <Card key={`${task.type}-${task.coachingWeek}`} variant="elevated" interactive>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{getCheckinTypeDisplayName(task.type)}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                        Day {task.coachingDay}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[2] }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: statusColor,
                        backgroundColor: statusBg,
                        padding: '6px 12px',
                        borderRadius: 999,
                      }}>
                        {getCheckinStatusLabel(task.status)}
                      </span>
                      {(task.status === 'available' || task.status === 'missed') && (
                        <Button size="md" onClick={() => router.push(task.href)}>Start</Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
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

      {/* Next step — only when actionable */}
      {status && status.nextAction && status.nextActionHref && (
        <section style={{ marginBottom: spacing[5] }}>
          <h2 style={sectionHeading}>Next Step</h2>
          <Card variant="elevated" className="card-hover">
            <p style={{ margin: '0 0 12px', fontSize: 15, color: colors.textSecondary }}>{status.nextAction}</p>
            <Button fullWidth onClick={() => router.push(status.nextActionHref!)}>Continue</Button>
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
