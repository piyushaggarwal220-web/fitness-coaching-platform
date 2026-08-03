'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { colors, spacing } from '@/lib/design-tokens'
import { motionClass, staggerClass } from '@/lib/motion'

const STORAGE_KEY = 'lurvox_getting_started_v1'

type Step = {
  id: string
  title: string
  detail: string
  href: string
  done: boolean
}

type Props = {
  hasPlan: boolean
  openedPlan: boolean
  hasLoggedToday: boolean
  checkinDoneThisWeek: boolean
}

export function GettingStartedGuide({
  hasPlan,
  openedPlan,
  hasLoggedToday,
  checkinDoneThisWeek,
}: Props) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1') {
        setVisible(false)
        return
      }
    } catch {
      // ignore storage errors
    }
    setVisible(true)
  }, [])

  if (!visible) return null

  const steps: Step[] = [
    {
      id: 'plan',
      title: 'Open your plan',
      detail: 'Read your diet and workout first.',
      href: '/plan',
      done: !hasPlan || openedPlan,
    },
    {
      id: 'log',
      title: 'Log today',
      detail: 'Tick off meals, workout, and water.',
      href: '/tracker',
      done: hasLoggedToday,
    },
    {
      id: 'coach',
      title: 'Message your coach',
      detail: 'Ask questions anytime in Coach chat.',
      href: '/client/chat',
      done: false,
    },
    {
      id: 'checkin',
      title: 'Send your check-in',
      detail: 'When it’s due, it shows on Today.',
      href: '/checkin',
      done: checkinDoneThisWeek,
    },
  ]

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  return (
    <Card
      variant="glass"
      className={motionClass.cardEnter}
      style={{ marginBottom: spacing[5], position: 'relative' }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss getting started"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `1px solid ${colors.borderSubtle}`,
          background: colors.bgElevated,
          color: colors.textMuted,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={16} />
      </button>

      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: colors.accent, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        How this app works
      </p>
      <h2 style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', paddingRight: 40 }}>
        Four simple steps
      </h2>
      <p style={{ margin: '8px 0 0', fontSize: 14, color: colors.textSecondary, lineHeight: 1.5, maxWidth: 360 }}>
        Follow these and you’ll always know what to do next.
      </p>

      <div style={{ display: 'grid', gap: 8, marginTop: spacing[4] }}>
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => router.push(step.href)}
            className={`btn-press ${staggerClass(index)}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '12px 14px',
              borderRadius: 14,
              border: `1px solid ${step.done ? 'rgba(34,197,94,0.25)' : colors.borderSubtle}`,
              background: step.done ? colors.successMuted : colors.bgElevated,
              color: colors.textPrimary,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: step.done ? colors.success : colors.accentMuted,
                color: step.done ? colors.textInverse : colors.accent,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {step.done ? <Check size={15} strokeWidth={3} /> : index + 1}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{step.title}</span>
              <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: colors.textMuted }}>{step.detail}</span>
            </span>
            <ChevronRight size={16} color={colors.textMuted} />
          </button>
        ))}
      </div>
    </Card>
  )
}
