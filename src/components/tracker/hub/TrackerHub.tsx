'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { buildModuleSummaries } from '@/lib/daily-tracker/module-summaries'
import type { TodayTrackerView } from '@/lib/daily-tracker/types'

export function TrackerHub({ view }: { view: TodayTrackerView }) {
  const modules = buildModuleSummaries(view.day)

  return (
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

      <div
        style={{
          marginTop: spacing[4],
          marginBottom: spacing[5],
          padding: spacing[4],
          borderRadius: radius.lg,
          background: colors.bgGlass,
          backdropFilter: 'blur(20px)',
          border: `1px solid ${colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: spacing[3],
        }}
      >
        <ProgressRing
          percent={view.day.overall_percent ?? 0}
          size={140}
          stroke={11}
          label="Today's Progress"
        />
        <div style={{ textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          Day {view.schedule.coachingDay} · Week {view.schedule.coachingWeek}
          {view.streak > 0 && (
            <div style={{ color: colors.accent, marginTop: 4 }}>{view.streak}-day streak</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {modules.map((mod) => (
          <Link
            key={mod.id}
            href={mod.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: spacing[4],
              borderRadius: radius.lg,
              background: colors.bgGlass,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${colors.borderSubtle}`,
              textDecoration: 'none',
              color: colors.textPrimary,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md,
                background: colors.accentMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                flexShrink: 0,
              }}
            >
              {mod.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{mod.title}</div>
              <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                {mod.subtitle}
              </div>
              <div
                style={{
                  marginTop: 10,
                  height: 4,
                  borderRadius: 999,
                  background: colors.bgElevated,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${mod.progress}%`,
                    background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentMuted})`,
                    transition: 'width 500ms ease',
                  }}
                />
              </div>
            </div>
            <ChevronRight size={22} color={colors.textMuted} style={{ flexShrink: 0 }} />
          </Link>
        ))}
      </div>

      {modules.length === 0 && (
        <p style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
          No tracker modules found in your active plan. Your coach will add diet, workout, and other sections to your
          plan.
        </p>
      )}
    </div>
  )
}
