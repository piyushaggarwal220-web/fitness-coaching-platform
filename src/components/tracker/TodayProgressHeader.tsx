'use client'

import { ProgressRing } from '@/components/tracker/ProgressRing'
import { CategoryPill } from '@/components/tracker/TrackerPrimitives'
import { colors, spacing } from '@/lib/design-tokens'
import { getCategoryDisplayScores, splitSnapshot } from '@/lib/daily-tracker/display'
import type { TodayTrackerView } from '@/lib/daily-tracker/types'

export function TodayProgressHeader({ view }: { view: TodayTrackerView }) {
  const { day, greeting, schedule, streak } = view
  const scores = getCategoryDisplayScores(day)
  const sections = splitSnapshot(day.snapshot, day.completion)

  const categories = [
    { key: 'diet', label: 'Diet', percent: scores.diet, show: sections.meals.length > 0 },
    { key: 'workout', label: 'Workout', percent: scores.workout, show: sections.workouts.length > 0 },
    { key: 'water', label: 'Water', percent: scores.water, show: sections.water != null },
    { key: 'cardio', label: 'Cardio', percent: scores.cardio, show: sections.cardio.length > 0 },
    { key: 'supplements', label: 'Supplements', percent: scores.supplements, show: sections.supplements.length > 0 },
    { key: 'sleep', label: 'Sleep', percent: scores.sleep, show: sections.sleep != null },
    { key: 'steps', label: 'Steps', percent: scores.steps, show: sections.steps != null },
  ].filter((c) => c.show)

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        marginBottom: spacing[4],
        paddingBottom: spacing[3],
        background: 'linear-gradient(180deg, var(--bg-primary) 85%, transparent)',
      }}
    >
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
        {greeting}
      </p>
      <h1
        style={{
          margin: '6px 0 0',
          fontSize: 'clamp(1.5rem, 5vw, 2rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
        }}
      >
        Today&apos;s Progress
      </h1>

      <div
        style={{
          marginTop: spacing[4],
          padding: spacing[4],
          borderRadius: 20,
          background: 'rgba(24, 24, 27, 0.85)',
          backdropFilter: 'blur(24px)',
          border: `1px solid ${colors.borderSubtle}`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing[3] }}>
          <ProgressRing percent={day.overall_percent ?? 0} size={160} stroke={12} label="Today's Completion" />
          <div style={{ textAlign: 'center', fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
            <div>
              <strong style={{ color: colors.textPrimary }}>Day {schedule.coachingDay}</strong> · Week{' '}
              {schedule.coachingWeek}
            </div>
            {streak > 0 && <div style={{ color: colors.accent, marginTop: 4 }}>{streak}-day streak</div>}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
            marginTop: spacing[4],
          }}
        >
          {categories.map((cat) => (
            <CategoryPill key={cat.key} label={cat.label} percent={cat.percent} done={cat.percent >= 100} />
          ))}
        </div>
      </div>
    </div>
  )
}
