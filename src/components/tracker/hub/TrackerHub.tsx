'use client'

import Link from 'next/link'
import {
  Activity,
  Check,
  ChevronRight,
  ClipboardList,
  Droplets,
  Dumbbell,
  Moon,
  Pill,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { WearableConnect } from '@/components/tracker/WearableConnect'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { TrackerRefreshControls } from '@/components/tracker/TrackerRefreshControls'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { clientColors as colors, radius, spacing } from '@/lib/design-tokens'
import { buildModuleSummaries } from '@/lib/daily-tracker/module-summaries'
import type { TrackerModuleId } from '@/lib/daily-tracker/module-summaries'
import type { TodayTrackerView, TrackerWeekProgress } from '@/lib/daily-tracker/types'

const MODULE_ICON: Record<TrackerModuleId, LucideIcon> = {
  diet: UtensilsCrossed,
  workout: Dumbbell,
  water: Droplets,
  steps: ClipboardList,
  sleep: Moon,
  supplements: Pill,
  cardio: Activity,
}

function moduleRank(id: TrackerModuleId): number {
  if (id === 'workout') return 0
  if (id === 'diet') return 1
  return 2
}

function HeroStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: `${spacing[2]}px ${spacing[1]}px`,
        borderRadius: radius.md,
        background: colors.bgSecondary,
        border: `1px solid ${colors.borderSubtle}`,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: highlight ? colors.accent : colors.textPrimary,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function WeekProgressCard({ title, week }: { title: string; week: TrackerWeekProgress }) {
  return (
    <div
      style={{
        marginTop: spacing[3],
        padding: spacing[4],
        borderRadius: radius.lg,
        background: colors.bgSecondary,
        border: `1px solid ${colors.borderSubtle}`,
        width: '100%',
        position: 'relative',
        color: colors.textPrimary,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 13, color: colors.accent, fontWeight: 800 }}>
          {week.average != null ? `${week.average}% avg` : 'No logs yet'}
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(week.days.length, 1)}, minmax(0, 1fr))`,
          gap: 6,
        }}
      >
        {week.days.map((day) => (
          <div key={day.logDate} style={{ textAlign: 'center' }}>
            <div
              style={{
                height: 36,
                borderRadius: 8,
                background:
                  (day.overallPercent ?? 0) >= 60 ? colors.successMuted : colors.bgElevated,
                border: `1px solid ${colors.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                color: colors.textPrimary,
              }}
            >
              {day.overallPercent != null ? `${day.overallPercent}` : '—'}
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: colors.textMuted }}>
              {day.logDate.slice(5)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TrackerHub({ view }: { view: TodayTrackerView }) {
  const modules = buildModuleSummaries(view.day)
  const { patchCompletion, saving } = useTracker()

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: spacing[2],
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: colors.accent,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {view.greeting}
          </p>
          <h1
            style={{
              margin: '6px 0 0',
              fontSize: 'clamp(1.5rem, 5vw, 2rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            Tracker
          </h1>
        </div>
        <TrackerRefreshControls />
      </div>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          marginTop: spacing[4],
          marginBottom: spacing[5],
          padding: spacing[5],
          borderRadius: radius.xl,
          // Mirrors the dashboard hero so the tracker feels like the same product.
          background: colors.bgCard,
          border: `1px solid ${colors.borderSubtle}`,
          backdropFilter: 'blur(20px)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.38)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: spacing[4],
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -90,
            right: -70,
            width: 220,
            height: 220,
            borderRadius: '50%',
            background: colors.accentGlow,
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }}
        />
        <ProgressRing
          percent={view.day.overall_percent ?? 0}
          size={96}
          stroke={8}
          label="Today"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: spacing[1],
            width: '100%',
            position: 'relative',
          }}
        >
          <HeroStat label="Day" value={String(view.schedule.coachingDay)} />
          <HeroStat label="Week" value={String(view.schedule.coachingWeek)} />
          <HeroStat label="Streak" value={view.streak > 0 ? `${view.streak}d` : '—'} highlight={view.streak > 0} />
        </div>
        {view.previousWeek && view.previousWeek.days.length > 0 && (
          <WeekProgressCard
            title={view.previousWeek.week > 0 ? `Last week (Week ${view.previousWeek.week})` : 'Last 7 logged days'}
            week={view.previousWeek}
          />
        )}
      </div>

      <div style={{ display: 'grid', gap: spacing[2] }}>
        {[...modules]
          .sort((a, b) => moduleRank(a.id) - moduleRank(b.id))
          .map((mod) => {
          const done = mod.progress >= 100
          const primary = mod.id === 'workout' || mod.id === 'diet'
          const Icon = MODULE_ICON[mod.id]
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className="card-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: spacing[4],
                borderRadius: radius.lg,
                background: colors.bgCard,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.35)' : primary ? colors.accent : colors.borderSubtle}`,
                textDecoration: 'none',
                color: colors.textPrimary,
                boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.md,
                  background: done ? colors.successMuted : colors.accentMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} color={done ? colors.success : colors.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{mod.title}</span>
                  {done && <Check size={15} color={colors.success} strokeWidth={3} />}
                </div>
                <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                  {mod.subtitle}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    height: 5,
                    borderRadius: 999,
                    background: colors.bgElevated,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${mod.progress}%`,
                      borderRadius: 999,
                      background: done ? colors.success : colors.accent,
                      transition: 'width 500ms ease',
                    }}
                  />
                </div>
              </div>
              <ChevronRight size={22} color={colors.textMuted} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>

      {modules.length === 0 && (
        <p style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
          Your plan doesn't include tracker items yet. Your coach adds meals, workouts, and daily targets here.
        </p>
      )}

      <WearableConnect
        variant="hub"
        completion={view.day.completion}
        saving={saving}
        onPatch={patchCompletion}
      />

      <p style={{ marginTop: spacing[5], textAlign: 'center' }}>
        <Link
          href="/client/report-issue?about=tracker"
          style={{ color: colors.textMuted, fontSize: 13, fontWeight: 600 }}
        >
          Tracker looks wrong? Tap Refresh, or send feedback
        </Link>
      </p>
    </div>
  )
}
