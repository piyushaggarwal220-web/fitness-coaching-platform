'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Apple,
  ChevronRight,
  Droplets,
  Dumbbell,
  Footprints,
  Moon,
  Pill,
  Activity,
} from 'lucide-react'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { buildModuleSummaries, type TrackerModuleId } from '@/lib/daily-tracker/module-summaries'
import type { TodayTrackerView } from '@/lib/daily-tracker/types'
import { motionClass, staggerClass } from '@/lib/motion'

const MODULE_ICONS: Record<TrackerModuleId, ReactNode> = {
  diet: <Apple size={22} color={colors.accent} />,
  workout: <Dumbbell size={22} color={colors.accent} />,
  water: <Droplets size={22} color={colors.accent} />,
  steps: <Footprints size={22} color={colors.accent} />,
  sleep: <Moon size={22} color={colors.accent} />,
  supplements: <Pill size={22} color={colors.accent} />,
  cardio: <Activity size={22} color={colors.accent} />,
}

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
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {view.greeting}
      </p>
      <h1
        className={motionClass.pageEnter}
        style={{
          margin: '6px 0 0',
          fontSize: 'clamp(1.5rem, 5vw, 2rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
        }}
      >
        Log today
      </h1>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: colors.textSecondary, lineHeight: 1.45 }}>
        Tap a section, tick what you finished, and you’re done.
      </p>

      <div
        className={motionClass.cardEnter}
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
          label="Today"
        />
        <div style={{ textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
          {view.streak > 0 ? (
            <div style={{ color: colors.accent, fontWeight: 700 }}>{view.streak}-day streak</div>
          ) : (
            <div>Start logging to build a streak</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {modules.map((mod, index) => (
          <Link
            key={mod.id}
            href={mod.href}
            className={`btn-press ${staggerClass(index)}`}
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
                flexShrink: 0,
              }}
            >
              {MODULE_ICONS[mod.id]}
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
                    background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentHover})`,
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
        <p style={{ color: colors.textMuted, textAlign: 'center', lineHeight: 1.6, marginTop: spacing[4] }}>
          Nothing to log yet. Open your plan, or message your coach if sections look empty.
        </p>
      )}
    </div>
  )
}
