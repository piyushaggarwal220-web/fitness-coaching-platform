'use client'

import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { WearableConnect } from '@/components/tracker/WearableConnect'
import { ProgressRing } from '@/components/tracker/ProgressRing'
import { TrackerRefreshControls } from '@/components/tracker/TrackerRefreshControls'
import { useTracker } from '@/components/tracker/context/TrackerContext'
import { colors, radius, spacing } from '@/lib/design-tokens'
import { buildModuleSummaries } from '@/lib/daily-tracker/module-summaries'
import type { TodayTrackerView } from '@/lib/daily-tracker/types'

function HeroStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: `${spacing[2]}px ${spacing[1]}px`,
        borderRadius: radius.md,
        background: 'rgba(255,255,255,0.04)',
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
          background:
            'linear-gradient(135deg, rgba(249,115,22,0.14) 0%, rgba(17,24,39,0.96) 42%, rgba(10,10,11,0.98) 100%)',
          border: '1px solid rgba(249,115,22,0.18)',
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
          size={140}
          stroke={11}
          label="Today's Progress"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: spacing[1],
            width: '100%',
            position: 'relative',
          }}
        >
          <HeroStat label="Day" value={String(view.schedule.coachingDay)} />
          <HeroStat label="Week" value={String(view.schedule.coachingWeek)} />
          <HeroStat label="Streak" value={view.streak > 0 ? `${view.streak}d` : '—'} highlight={view.streak > 0} />
        </div>
      </div>

      <div style={{ display: 'grid', gap: spacing[2] }}>
        {modules.map((mod) => {
          const done = mod.progress >= 100
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
                background: done
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(24,24,27,0.92) 60%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(24,24,27,0.92) 60%)',
                backdropFilter: 'blur(16px)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.22)' : colors.borderSubtle}`,
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
                  border: `1px solid ${done ? 'rgba(34,197,94,0.28)' : 'rgba(249,115,22,0.22)'}`,
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
                    background: 'rgba(255,255,255,0.07)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${mod.progress}%`,
                      borderRadius: 999,
                      background: done
                        ? colors.success
                        : `linear-gradient(90deg, ${colors.accent}, ${colors.accentHover})`,
                      boxShadow: mod.progress > 0
                        ? `0 0 12px ${done ? 'rgba(34,197,94,0.5)' : colors.accentGlow}`
                        : 'none',
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
          No tracker modules found in your active plan. Your coach will add diet, workout, and other sections to your
          plan.
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
