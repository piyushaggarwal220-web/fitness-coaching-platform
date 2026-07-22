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
import {
  getClientCheckinSchedule,
  getCheckinStatusLabel,
  getCheckinTypeDisplayName,
  hasCoachingDayStarted,
} from '@/lib/checkin-schedule';
import { shouldBypassCheckinScheduleClient } from '@/lib/config';
import { DevelopmentModeBadge } from '@/components/dev/DevelopmentModeBadge';
import { formatPlanDate } from '@/lib/plans';
import { authenticateClient, getOnboardingLabel } from '@/lib/onboarding';
import { SESSION_RESTORE_MESSAGE } from '@/lib/session-restore';
import { PlanCountdownCard } from '@/components/dashboard/PlanCountdown';
import { ActiveSubscriptionCard } from '@/components/dashboard/ActiveSubscriptionCard';
import { LeagueHomeCard } from '@/components/league/LeagueHomeCard';
import { NotificationActivationGate } from '@/components/notifications/PushNotificationActivation';
import { getClientDashboardStatus } from '@/lib/purchase-dashboard';
import { getActiveSubscription } from '@/lib/subscription';
import { loadTodayTrackerView } from '@/lib/daily-tracker';
import { isItemComplete } from '@/lib/daily-tracker/scores';
import type { DailyTrackerDay, TrackerSnapshotItem } from '@/lib/daily-tracker/types';
import { createClient } from '@/lib/supabase/client';
import { colors, spacing, typography } from '@/lib/design-tokens';
import { mobileStyles } from '@/lib/mobile-styles';
import type { Checkin, Coach, OnboardingProfile, Plan, Purchase, Workout } from '@/types/database';
import type { InitialPlanGenerationJob } from '@/lib/initial-plan-generation';

const supabase = createClient();

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href: string;
};

type DashboardCheckin = Pick<
  Checkin,
  'id' | 'client_id' | 'checkin_type' | 'submitted_at' | 'coaching_week' | 'coaching_day' | 'reviewed'
>;

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [allCheckins, setAllCheckins] = useState<DashboardCheckin[]>([]);
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
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const [generationJob, setGenerationJob] = useState<InitialPlanGenerationJob | null>(null);

  useEffect(() => {
    if (!profile?.checkin_schedule_started_at) return;
    const timer = window.setInterval(() => setScheduleNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [profile?.checkin_schedule_started_at]);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const result = await authenticateClient(supabase, router, {
          requireOnboarding: true,
          requirePayment: true,
        });
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
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);
        const coachId = profileData.coach_id;

        const [
          checkinResult,
          planResult,
          purchaseResult,
          workoutsResult,
          weekWorkoutsResult,
          coachResult,
          convResult,
          generationResult,
        ] = await Promise.all([
          supabase
            .from('checkins')
            .select('id, client_id, checkin_type, submitted_at, coaching_week, coaching_day, reviewed')
            .eq('client_id', userId)
            .order('submitted_at', { ascending: false })
            .limit(24),
          supabase
            .from('plans')
            .select('id, client_id, coach_id, title, phase, version, active, delivered_at, updated_at, created_at, diet_opened_at, workout_opened_at')
            .eq('client_id', userId)
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('purchases')
            .select('id, user_id, status, amount_paise, currency, created_at, plan_name, plan_slug')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('workouts')
            .select('id, user_id, name, date, created_at, duration, calories')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('workouts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('date', weekAgoStr),
          coachId
            ? supabase.from('coaches').select('id, name, user_id, hard_cap').eq('id', coachId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          coachId
            ? supabase.from('coach_conversations').select('unread_by_client').eq('client_id', userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('initial_plan_generation_jobs')
            .select('id, client_id, status, error_message, updated_at')
            .eq('client_id', userId)
            .maybeSingle(),
        ]);

        if (checkinResult.error) throw new Error(checkinResult.error.message);
        if (planResult.error) throw new Error(planResult.error.message);
        if (purchaseResult.error) throw new Error(purchaseResult.error.message);
        if (workoutsResult.error) throw new Error(workoutsResult.error.message);
        if (weekWorkoutsResult.error) throw new Error(weekWorkoutsResult.error.message);
        if (coachResult.error) throw new Error(coachResult.error.message);
        if (convResult.error) throw new Error(convResult.error.message);
        if (generationResult.error) throw new Error(generationResult.error.message);

        const checkinList = (checkinResult.data ?? []) as DashboardCheckin[];
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

        const planData = planResult.data as Plan | null;
        setActivePlan(planData);
        setPurchase(purchaseResult.data as Purchase | null);
        setWeekWorkouts(weekWorkoutsResult.count ?? 0);

        const workouts = (workoutsResult.data ?? []) as Workout[];
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

        if (coachResult.data) setCoach(coachResult.data as Coach);
        setUnreadMessages((convResult.data?.unread_by_client as number) ?? 0);
        setGenerationJob(generationResult.data as InitialPlanGenerationJob | null);

        // Paint the dashboard first; tracker summary can fill in afterwards.
        setLoading(false);

        if (planData) {
          void loadTodayTrackerView(supabase, userId, profileData).then(({ view }) => {
            if (!view) return;
            setTrackerStreak(view.streak);
            setTodayTrackerPercent(view.day.overall_percent ?? 0);
            setTrackerSubtitle(getTrackerHomeSummary(view.day));
          });
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard');
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  const status = profile
    ? getClientDashboardStatus({ profile, purchase, coach, activePlan })
    : null;

  const subscription = getActiveSubscription(
    purchase,
    profile?.subscription_expires_at ?? null
  );

  const checkinScheduleBypass = shouldBypassCheckinScheduleClient();
  const coachingDayStarted = profile?.checkin_schedule_started_at
    ? hasCoachingDayStarted(profile.checkin_schedule_started_at, scheduleNow)
    : false;
  const coachingDayPending = Boolean(profile?.checkin_schedule_started_at) && !coachingDayStarted;
  const checkinSchedule = profile?.checkin_schedule_started_at && coachingDayStarted
    ? getClientCheckinSchedule(profile.checkin_schedule_started_at, allCheckins, scheduleNow, {
        bypassSchedule: checkinScheduleBypass,
      })
    : null;

  const firstName = profile?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const planCard = profile ? (
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
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activePlan ? activePlan.title : profile.plan_delivered ? 'Plan pending activation' : 'Plan in preparation'}
          </p>
          {activePlan && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
              v{activePlan.version} · Updated {formatPlanDate(activePlan.updated_at)}
            </p>
          )}
          {status?.coachName && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textSecondary }}>
              Coach: {status.coachName}
            </p>
          )}
        </div>
        <ArrowRight size={20} color={colors.textMuted} />
      </div>
    </Card>
  ) : null;
  const trackerCard = activePlan && coachingDayPending ? (
    <Card variant="glass">
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Timer size={22} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>Your first day starts tomorrow</p>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted }}>
            Daily tracking opens at 12:00 AM.
          </p>
        </div>
      </div>
    </Card>
  ) : activePlan ? (
    <Card
      variant={status?.preferTrackerUpTop ? 'elevated' : 'glass'}
      onClick={() => router.push('/tracker')}
      style={{ cursor: 'pointer' }}
      className={status?.preferTrackerUpTop ? 'card-hover' : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3] }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.accentMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ListChecks size={22} color={colors.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
            {status?.preferTrackerUpTop ? "Open today's tracker" : "Today's Tracker"}
          </p>
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
  ) : null;

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

      {generationJob && !activePlan && (
        <div style={{
          marginBottom: spacing[4],
          padding: spacing[3],
          borderRadius: 14,
          backgroundColor: generationJob.status === 'failed' ? colors.dangerMuted : colors.accentMuted,
          color: generationJob.status === 'failed' ? colors.danger : colors.textPrimary,
          fontSize: 14,
          lineHeight: 1.5,
        }}>
          <strong>
            {generationJob.status === 'queued'
              ? 'Your AI diet and workout draft is queued.'
              : generationJob.status === 'generating'
                ? 'Your AI diet and workout draft is being prepared.'
                : generationJob.status === 'ready'
                  ? 'Your draft is ready for your coach’s note and review.'
                  : 'Draft generation needs coach attention.'}
          </strong>
          <div>
            Nothing is delivered until your coach reviews it and explicitly sends it.
          </div>
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

      {subscription && <ActiveSubscriptionCard subscription={subscription} />}

      <LeagueHomeCard />

      {/* Coach assigned + 24h plan countdown (hidden once diet+workout opened) */}
      {profile && status?.paymentConfirmed && (
        <PlanCountdownCard
          profile={profile}
          activePlan={activePlan}
          coachName={status.coachName ?? coach?.name}
        />
      )}

      <NotificationActivationGate />

      {/* Next step — lead with today’s action */}
      {status && status.nextAction && !status.preferTrackerUpTop && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader title="Next step" subtitle="What to do now" />
          <Card variant="elevated" className="card-hover">
            <p style={{ margin: '0 0 12px', fontSize: 15, color: colors.textSecondary, lineHeight: 1.5 }}>{status.nextAction}</p>
            {status.nextActionHref ? (
              <Button fullWidth onClick={() => router.push(status.nextActionHref!)}>Continue</Button>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: colors.textMuted, lineHeight: 1.45 }}>
                We&apos;ll notify you as soon as your coach is ready.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Keep plan and tracker together; tracker leads once daily tracking is preferred. */}
      {(profile || activePlan) && (
        <section style={{ marginBottom: spacing[7] }}>
          <SectionHeader
            title="Plan & Tracker"
            subtitle={status?.preferTrackerUpTop
              ? 'Log today’s habits, then review your coaching plan'
              : 'Your coaching plan and daily tracking'}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[3] }}>
            {status?.preferTrackerUpTop ? (
              <>
                {trackerCard}
                {planCard}
              </>
            ) : (
              <>
                {planCard}
                {trackerCard}
              </>
            )}
          </div>
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
                            ? 'Available now (48h window)'
                            : checkinSchedule.nextCheckinStatus === 'missed'
                              ? 'Missed — wait for next'
                              : 'Available in'}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
                          {checkinSchedule.nextCheckinStatus === 'available'
                            ? 'Now'
                            : checkinSchedule.nextCheckinStatus === 'missed'
                              ? 'Closed'
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
                        {task.status === 'available' && (
                          <Button size="md" onClick={() => router.push(task.href)}>Start</Button>
                        )}
                        {task.status === 'missed' && (
                          <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 600, maxWidth: 120, textAlign: 'right' }}>
                            Window closed — wait for next
                          </span>
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
