'use client'

import { useRouter } from 'next/navigation'
import {
  ClipboardList,
  Dumbbell,
  Droplets,
  MessageCircle,
  Moon,
  Pill,
  Timer,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { clientColors as colors, spacing } from '@/lib/design-tokens'
import type { TrackerModuleId, TrackerModuleSummary } from '@/lib/daily-tracker/module-summaries'

const MODULE_ICON: Record<TrackerModuleId, LucideIcon> = {
  diet: UtensilsCrossed,
  workout: Dumbbell,
  water: Droplets,
  steps: ClipboardList,
  sleep: Moon,
  supplements: Pill,
  cardio: Timer,
}

const MODULE_ACTION: Record<TrackerModuleId, string> = {
  diet: "Open today's meals",
  workout: 'Start workout',
  water: 'Log water',
  steps: 'Log steps',
  sleep: 'Log sleep',
  supplements: 'Log supplements',
  cardio: 'Log cardio',
}

export type TodayCheckin = {
  label: string
  detail: string
  href: string
  due: boolean
}

type Props = {
  firstName: string
  contextLine: string
  modules: TrackerModuleSummary[] | null
  unreadMessages: number
  showChat: boolean
  weekWorkouts: number
  streak: number
  todayPercent: number | null
  nextCheckin: TodayCheckin | null
  missedCount: number
}

export function TodayFocus({
  firstName,
  contextLine,
  modules,
  unreadMessages,
  showChat,
  weekWorkouts,
  streak,
  todayPercent,
  nextCheckin,
  missedCount,
}: Props) {
  const router = useRouter()
  const workout = modules?.find((item) => item.id === 'workout') ?? null
  const diet = modules?.find((item) => item.id === 'diet') ?? null
  const primary = workout ?? diet ?? modules?.[0] ?? null
  const secondary = primary && diet && primary.id !== 'diet' ? diet : null
  const rest = (modules ?? []).filter((item) => item.id !== primary?.id && item.id !== secondary?.id)

  return (
    <section style={{ marginBottom: spacing[6] }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: colors.accent,
        }}
      >
        Today
      </p>
      <h1
        style={{
          margin: '8px 0 0',
          fontSize: 'clamp(2rem, 6vw, 2.75rem)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
          color: colors.textPrimary,
        }}
      >
        {firstName}
      </h1>
      {contextLine && (
        <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.45, color: colors.textSecondary }}>
          {contextLine}
        </p>
      )}

      <div className="lx-today-grid" style={{ marginTop: spacing[5] }}>
        <div className="lx-today-primary">
          {modules == null ? (
            <div className="skeleton" style={{ height: 168, borderRadius: 16 }} />
          ) : primary ? (
            <ActionCard
              eyebrow={primary.id === 'workout' ? "Today's workout" : primary.id === 'diet' ? "Today's nutrition" : 'Do this next'}
              title={primary.subtitle || primary.title}
              detail=""
              action={MODULE_ACTION[primary.id]}
              icon={MODULE_ICON[primary.id]}
              primary
              onOpen={() => router.push(primary.href)}
            />
          ) : (
            <ActionCard
              eyebrow="Today"
              title="Your plan is being prepared"
              detail="Smart Coach is building your personalized plan. Workout and meals show up here once it's ready."
              action="View plan"
              icon={ClipboardList}
              primary
              onOpen={() => router.push('/plan')}
            />
          )}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {secondary && (
            <ActionCard
              eyebrow="Today's nutrition"
              title={secondary.subtitle || secondary.title}
              detail=""
              action={MODULE_ACTION[secondary.id]}
              icon={MODULE_ICON[secondary.id]}
              onOpen={() => router.push(secondary.href)}
            />
          )}

          {rest.length > 0 && (
            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${colors.borderSubtle}`,
                background: colors.bgCard,
                overflow: 'hidden',
              }}
            >
              {rest.map((item, index) => {
                const Icon = MODULE_ICON[item.id]
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => router.push(item.href)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: '14px 16px',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : `1px solid ${colors.divider}`,
                      background: 'transparent',
                      color: colors.textPrimary,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={18} color={colors.textMuted} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{item.title}</span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: colors.textMuted }}>
                        {item.subtitle}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.textSecondary }}>
                      {item.progress >= 100 ? 'Done' : 'Log'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {nextCheckin && (
            <button
              type="button"
              onClick={() => router.push(nextCheckin.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '14px 16px',
                borderRadius: 16,
                border: `1px solid ${nextCheckin.due ? colors.accent : colors.borderSubtle}`,
                background: nextCheckin.due ? colors.accentMuted : colors.bgCard,
                color: colors.textPrimary,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <Timer size={18} color={colors.accent} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted }}>
                  {nextCheckin.due ? 'Check-in due' : 'Next check-in'}
                </span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 15, fontWeight: 700 }}>{nextCheckin.label}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: colors.textSecondary }}>{nextCheckin.detail}</span>
              </span>
            </button>
          )}

          {showChat && (
            <button
              type="button"
              onClick={() => router.push('/client/chat')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '14px 16px',
                borderRadius: 16,
                border: `1px solid ${colors.borderSubtle}`,
                background: colors.bgCard,
                color: colors.textPrimary,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <MessageCircle size={18} color={colors.textMuted} />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>
                  Smart Coach
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 13, color: colors.textSecondary }}>
                  {unreadMessages > 0
                    ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}`
                    : 'Message your coach'}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        <QuietStat label="This week" value={String(weekWorkouts)} hint="workouts" />
        <QuietStat label="Streak" value={streak > 0 ? String(streak) : '—'} hint={streak === 1 ? 'day' : 'days'} />
        <QuietStat label="Today" value={todayPercent != null ? `${todayPercent}%` : '—'} hint="logged" />
      </div>

      {missedCount > 0 && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: colors.textMuted }}>
          {missedCount} earlier check-in {missedCount === 1 ? 'window' : 'windows'} closed. The next open one is shown above.
        </p>
      )}
    </section>
  )
}

function ActionCard({
  eyebrow,
  title,
  detail,
  action,
  icon: Icon,
  primary,
  onOpen,
}: {
  eyebrow: string
  title: string
  detail: string
  action: string
  icon: LucideIcon
  primary?: boolean
  onOpen: () => void
}) {
  return (
    <div
      style={{
        padding: primary ? 20 : 16,
        borderRadius: 16,
        background: colors.bgCard,
        border: `1px solid ${primary ? colors.accent : colors.borderSubtle}`,
        minHeight: primary ? 168 : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.accent }}>
        <Icon size={18} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{eyebrow}</span>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: primary ? 22 : 17, fontWeight: 800, letterSpacing: '-0.03em', color: colors.textPrimary }}>
          {title}
        </p>
        {detail ? (
          <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: colors.textSecondary }}>{detail}</p>
        ) : null}
      </div>
      <div style={{ marginTop: 'auto' }}>
        <Button size={primary ? 'lg' : 'md'} onClick={onOpen}>
          {action}
        </Button>
      </div>
    </div>
  )
}

function QuietStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${colors.divider}` }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textMuted }}>
        {label}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: colors.textPrimary }}>{value}</p>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: colors.textMuted }}>{hint}</p>
    </div>
  )
}
