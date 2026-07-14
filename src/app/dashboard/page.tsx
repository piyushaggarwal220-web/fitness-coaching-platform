'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  Flame,
  ListChecks,
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
import { loadTodayTrackerView } from '@/lib/daily-tracker';
import { isItemComplete } from '@/lib/daily-tracker/scores';
import type { DailyTrackerDay, TrackerSnapshotItem } from '@/lib/daily-tracker/types';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing, typography } from '@/lib/design-tokens';
import { mobileStyles } from '@/lib/mobile-styles';
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase, Workout } from '@/types/database';

const supabase = createClient();

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [allCheckins, setAllCheckins] = useState<Checkin[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);
  const [weekWorkouts, setWeekWorkouts] = useState(0);
  const [trackerStreak, setTrackerStreak] = useState(0);
  const [todayTrackerPercent, setTodayTrackerPercent] = useState<number | null>(null);
  const [trackerSubtitle, setTrackerSubtitle] = useState('Meals, workout, water & more');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
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

        if (latestCheckin) {
          activity.push({
            id: `checkin-${latestCheckin.id}`,
            icon: <ClipboardList size={18} color={colors.accent} />,
            title: `${latestCheckin.checkin_type === 'mid_week' ? 'Day 3' : 'Weekly'} check-in submitted`,
            subtitle: formatCheckinDate(latestCheckin.submitted_at),
            href: '/journey',
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

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);

        const { count: weekWorkoutCount, error: weekWorkoutsError } = await supabase
          .from('workouts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('date', weekAgoStr);

        if (weekWorkoutsError) throw new Error(weekWorkoutsError.message);
        setWeekWorkouts(weekWorkoutCount ?? 0);

        const workouts = (workoutsData ?? []) as Workout[];

        for (const w of workouts.slice(0, 3)) {
          activity.push({
            id: `workout-${w.id}`,
            icon: <Dumbbell size={18} color={colors.accent} />,
            title: `Completed workout — ${w.name}`,
            subtitle: new Date(w.date ?? w.created_at).toLocaleString(),
            href: '/workouts',
          });
        }

        setRecentActivity(activity.slice(0, 5));

        if (planData) {
          const { view } = await loadTodayTrackerView(supabase, userId, profileData);
          if (view) {
            setTrackerStreak(view.streak);
            setTodayTrackerPercent(view.day.overall_percent ?? 0);
            setTrackerSubtitle(getTrackerHomeSummary(view.day));
          }
        }

        if (result.profile?.coach_id) {
          const { data: coachData, error: coachError } = await supabase
            .from('coaches')
            .select('id, name, user_id, hard_cap')
            .eq('id', result.profile.coach_id)
            .maybeSingle();
          if (coachError) throw new Error(coachError.message);
          setCoach(coachData);

          const { data: conv, error: convError } = await supabase
            .from('coach_conversations')
            .select('unread_by_client')
            .eq('client_id', userId)
            .maybeSingle();
          if (convError) throw new Error(convError.message);
          setUnreadMessages((conv?.unread_by_client as number) ?? 0);
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
      <div style={{ marginBottom: spacing[6] }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: colors.accent,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Good {getGreeting()}
        </p>
        <h1 style={{ ...typography.pageTitle, marginTop: 6 }}>{firstName}</h1>
        <p style={{ margin: '10px 0 0', fontSize: 16, color: colors.textSecondary, lineHeight: 1.45 }}>
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

      {/* Next step — lead with today’s action */}
      {status && status.nextAction && status.nextActionHref && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="Next step" subtitle="What to do now" />
          <Card variant="elevated" className="card-hover">
            <p style={{ margin: '0 0 12px', fontSize: 15, color: colors.textSecondary, lineHeight: 1.5 }}>{status.nextAction}</p>
            <Button fullWidth onClick={() => router.push(status.nextActionHref!)}>Continue</Button>
          </Card>
        </section>
      )}

      {/* Plan + daily tracking */}
      {(profile || activePlan) && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="Your plan" subtitle="Active coaching plan and daily tracking" />

          {profile && (
            <Card
              variant="glass"
              onClick={() => router.push('/plan')}
              style={{ cursor: 'pointer', marginBottom: activePlan ? spacing[3] : 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={22} color={colors.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          )}

          {activePlan && (
            <Card variant="glass" onClick={() => router.push('/tracker')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ListChecks size={22} color={colors.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>Today&apos;s Tracker</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
                    {trackerSubtitle}
                  </p>
                </div>
                {todayTrackerPercent != null && (
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: colors.accent,
                    backgroundColor: colors.accentMuted,
                    padding: '6px 10px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}>
                    {todayTrackerPercent}%
                  </span>
                )}
                <ArrowRight size={20} color={colors.textMuted} />
              </div>
            </Card>
          )}
        </section>
      )}

      {/* Coaching week + next check-in */}
      {checkinSchedule && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="This week" subtitle="Your coaching week and check-in schedule" />

          {checkinSchedule.developmentScheduleMessage ? (
            <Card variant="glass" style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.warningMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Timer size={22} color={colors.warning} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, fontWeight: 600 }}>Development Mode</p>
                  <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                    {checkinSchedule.developmentScheduleMessage}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card variant="glass" style={{ marginBottom: spacing[3] }}>
              <div style={{ display: 'grid', gap: spacing[3] }}>
                <div>
                  <p style={eyebrowLabel}>Current Coaching Week</p>
                  <p style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em' }}>
                    Week {checkinSchedule.activeCoachingWeek}
                  </p>
                </div>
                {checkinSchedule.nextCheckin && (
                  <>
                    <div>
                      <p style={eyebrowLabel}>Next Check-in</p>
                      <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
                        {getCheckinTypeDisplayName(checkinSchedule.nextCheckin.type)}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 14, color: colors.textSecondary }}>
                        Week {checkinSchedule.nextCheckin.coachingWeek} · Day {checkinSchedule.nextCheckin.coachingDay}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Timer size={20} color={colors.accent} />
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>
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
          )}

          {checkinSchedule.weekCheckins.length > 0 && (
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
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>{getCheckinTypeDisplayName(task.type)}</p>
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
          )}
        </section>
      )}

      {/* Progress — this week / streak / today */}
      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Progress" subtitle="This week’s training pulse" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing[2] }}>
          <StatCard label="Week workouts" value={String(weekWorkouts)} icon={<Dumbbell size={18} />} />
          <StatCard label="Streak" value={String(trackerStreak)} icon={<Flame size={18} />} />
          <StatCard
            label="Today"
            value={todayTrackerPercent != null ? `${todayTrackerPercent}%` : '—'}
            icon={<Calendar size={18} />}
          />
        </div>
      </section>

      {/* Coach message — only when not already in bottom-nav duplicates */}
      {coach && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="Your coach" subtitle="Message your assigned coach" />
          <Card variant="glass" onClick={() => router.push('/client/chat')} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <MessageCircle size={20} color={colors.accent} />
                {unreadMessages > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    backgroundColor: colors.danger,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px',
                  }}>
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Message {coach.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.textMuted }}>
                  {unreadMessages > 0
                    ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`
                    : 'Your assigned coach'}
                </p>
              </div>
              <ArrowRight size={20} color={colors.textMuted} />
            </div>
          </Card>
        </section>
      )}

      {/* Recent activity */}
      <section style={{ marginBottom: spacing[7] }}>
        <SectionHeader title="Recent activity" subtitle="Latest check-ins and workouts" />
        <Card variant="elevated" padding={0} style={{ overflow: 'hidden' }}>
          {recentActivity.length === 0 ? (
            <p style={{ margin: 0, padding: spacing[4], color: colors.textMuted, fontSize: 15 }}>
              No activity yet. Log a workout or submit your first check-in.
            </p>
          ) : (
            recentActivity.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  width: '100%',
                  padding: `${spacing[3]}px ${spacing[4]}px`,
                  border: 'none',
                  borderBottom: i < recentActivity.length - 1 ? `1px solid ${colors.divider}` : 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'inherit',
                }}
              >
                {item.icon}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>{item.subtitle}</p>
                </div>
                <ArrowRight size={16} color={colors.textMuted} />
              </button>
            ))
          )}
        </Card>
      </section>

      {/* Onboarding summary — collapsed by default */}
      {profile && (
        <section>
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              marginBottom: profileOpen ? spacing[3] : 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-expanded={profileOpen}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.25rem, 4.5vw, 1.5rem)',
                  fontWeight: 800,
                  color: colors.textPrimary,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                }}
              >
                Your profile
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted, lineHeight: 1.4 }}>
                Key details from onboarding
              </p>
            </div>
            <ChevronDown
              size={22}
              color={colors.textMuted}
              style={{
                transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 150ms ease',
                flexShrink: 0,
              }}
            />
          </button>
          {profileOpen && (
            <Card variant="elevated">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing[3] }}>
                <GlanceItem label="Goal" value={getOnboardingLabel('fitness_goal', profile.fitness_goal)} />
                <GlanceItem label="Training" value={getOnboardingLabel('training_experience', profile.training_experience)} />
                <GlanceItem label="Weight" value={profile.weight ? `${profile.weight} kg` : '—'} />
                <GlanceItem label="Age" value={profile.age ? `${profile.age} yrs` : '—'} />
              </div>
            </Card>
          )}
        </section>
      )}
    </ClientShell>
  );
}

function getTrackerHomeSummary(day: DailyTrackerDay): string {
  const selectedDiet = day.completion.selectedDietDay
  const selectedWorkout = day.completion.selectedWorkoutDay
  const hasDietDays = day.snapshot.items.some(
    (item) => item.type === 'meal' && Boolean(item.dietDay)
  )
  if (hasDietDays && !selectedDiet) return "Choose today's diet day"

  const hasWorkoutDays =
    Boolean(day.snapshot.workoutDays?.length) ||
    day.snapshot.items.some((item) => item.type === 'workout' && Boolean(item.workoutDay))
  if (hasWorkoutDays && !selectedWorkout && (day.snapshot.workoutDays?.length ?? 0) > 1) {
    return "Choose today's workout day"
  }

  const trackable = day.snapshot.items.filter((item) =>
    isTrackableForHome(item, selectedDiet, selectedWorkout ?? undefined)
  )
  if (trackable.length === 0) return "Open to start today's log"

  const done = trackable.filter((item) => isItemComplete(item, day.completion)).length
  const total = trackable.length
  if (done === total) return `${done}/${total} done — all set for today`

  const next = trackable.find((item) => !isItemComplete(item, day.completion))
  const nextLabel = nextItemLabel(next)
  return `${done}/${total} done · ${nextLabel}`
}

function isTrackableForHome(
  item: TrackerSnapshotItem,
  selectedDietDay?: string | null,
  selectedWorkoutDay?: string
): boolean {
  if (item.type === 'note') return false
  if (item.type === 'meal' && item.dietDay) {
    if (!selectedDietDay) return false
    return item.dietDay === selectedDietDay
  }
  if (item.type === 'workout' && item.workoutDay) {
    if (!selectedWorkoutDay) return false
    return item.workoutDay === selectedWorkoutDay
  }
  return true
}

function nextItemLabel(item: TrackerSnapshotItem | undefined): string {
  if (!item) return 'Continue'
  switch (item.type) {
    case 'meal':
      return 'Meals left'
    case 'workout':
      return 'Workout left'
    case 'water':
      return 'Water left'
    case 'sleep':
      return 'Sleep left'
    case 'supplement':
      return 'Supplements left'
    case 'cardio':
      return 'Cardio left'
    default:
      return 'Continue'
  }
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: spacing[3] }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'clamp(1.25rem, 4.5vw, 1.5rem)',
          fontWeight: 800,
          color: colors.textPrimary,
          letterSpacing: '-0.03em',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '6px 0 0', fontSize: 14, color: colors.textMuted, lineHeight: 1.4 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function GlanceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const eyebrowLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 700,
};
