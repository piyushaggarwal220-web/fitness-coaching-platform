'use client'

import { useEffect, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { AI_GENERATION_STEPS, motionClass, useReducedMotion } from '@/lib/motion'

type AiGenerationProgressProps = {
  active?: boolean
}

/** Premium multi-step AI generation progress */
export function AiGenerationProgress({ active = true }: AiGenerationProgressProps) {
  const reduced = useReducedMotion()
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (!active || reduced) return

    const interval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, AI_GENERATION_STEPS.length - 1))
    }, 2800)

    return () => clearInterval(interval)
  }, [active, reduced])

  useEffect(() => {
    if (!active) setStepIndex(0)
  }, [active])

  const step = AI_GENERATION_STEPS[stepIndex]
  const progress = ((stepIndex + 1) / AI_GENERATION_STEPS.length) * 100

  return (
    <div style={{ marginTop: 12 }}>
      <div
        key={step}
        className={motionClass.aiStepEnter}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
          fontSize: 14,
          fontWeight: 600,
          color: colors.textPrimary,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: colors.accent,
            flexShrink: 0,
          }}
        />
        {step}
      </div>
      <div style={{ height: 3, backgroundColor: colors.bgElevated, borderRadius: 999, overflow: 'hidden' }}>
        <div
          className="motion-progress-fill"
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: colors.accent,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  )
}
