'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { colors, radius, spacing, transition } from '@/lib/design-tokens'
import { motionClass } from '@/lib/motion'

export const trackerInputStyle: CSSProperties = {
  padding: '12px 14px',
  borderRadius: radius.sm,
  border: `1px solid ${colors.borderSubtle}`,
  background: colors.bgElevated,
  color: colors.textPrimary,
  fontSize: 15,
  width: '100%',
  minHeight: 48,
}

/**
 * Shared glass surfaces so tracker cards read like the dashboard rather than flat grey blocks.
 * `trackerSurface` is for standalone cards; `trackerSurfaceInset` for panels nested inside one.
 */
export const trackerSurface: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(24,24,27,0.92) 60%)',
  backdropFilter: 'blur(16px)',
  border: `1px solid ${colors.borderSubtle}`,
  boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
}

export const trackerSurfaceInset: CSSProperties = {
  background: 'rgba(255,255,255,0.045)',
  border: `1px solid ${colors.borderSubtle}`,
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  staggerIndex,
  accent,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
  staggerIndex?: number
  accent?: boolean
}) {
  return (
    <div
      className={`${motionClass.cardEnter} ${staggerIndex != null ? `motion-stagger-${Math.min(staggerIndex, 8)}` : ''}`}
      style={{
        borderRadius: radius.lg,
        padding: spacing[4],
        marginBottom: spacing[4],
        background: colors.bgGlass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${accent ? colors.accentMuted : colors.borderSubtle}`,
        boxShadow: accent ? `0 0 0 1px ${colors.accentMuted}, 0 8px 32px rgba(0,0,0,0.35)` : '0 4px 24px rgba(0,0,0,0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: spacing[3] }}>
        {icon && (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.sm,
              background: colors.accentMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h2>
          {subtitle && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, lineHeight: 1.4 }}>{subtitle}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

export function ProgressBar({
  percent,
  height = 8,
  color = colors.accent,
}: {
  percent: number
  height?: number
  color?: string
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      style={{
        height,
        borderRadius: radius.full,
        background: colors.bgElevated,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clamped}%`,
          background: `linear-gradient(90deg, ${color}, ${colors.accentMuted})`,
          transition: transition('medium', 'width'),
          borderRadius: radius.full,
        }}
      />
    </div>
  )
}

export function MiniRing({ percent, size = 36, done }: { percent: number; size?: number; done?: boolean }) {
  const stroke = 3
  const radiusPx = (size - stroke) / 2
  const circumference = 2 * Math.PI * radiusPx
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radiusPx} fill="none" stroke={colors.bgElevated} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          fill="none"
          stroke={done ? colors.success : colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={done ? 0 : offset}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      {done && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={size * 0.4} color={colors.success} strokeWidth={3} />
        </div>
      )}
    </div>
  )
}

export function CategoryPill({
  label,
  percent,
  done,
}: {
  label: string
  percent: number
  done?: boolean
}) {
  const complete = done ?? percent >= 100
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderRadius: radius.sm,
        background: complete ? colors.successMuted : colors.bgElevated,
        border: `1px solid ${complete ? 'rgba(34,197,94,0.2)' : colors.borderSubtle}`,
      }}
    >
      <MiniRing percent={percent} done={complete} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{label}</div>
        <div style={{ fontSize: 11, color: colors.textMuted }}>{percent}%</div>
      </div>
      {complete && <Check size={16} color={colors.success} strokeWidth={3} />}
    </div>
  )
}

export function CompletionToggle({
  completed,
  onToggle,
  disabled,
  label,
}: {
  completed: boolean
  onToggle: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-label={label ?? (completed ? 'Mark incomplete' : 'Mark complete')}
      style={{
        width: 44,
        height: 44,
        borderRadius: radius.full,
        border: `2px solid ${completed ? colors.success : colors.borderSubtle}`,
        background: completed ? colors.successMuted : colors.bgElevated,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        transition: transition('fast'),
      }}
    >
      {completed ? (
        <Check size={22} color={colors.success} strokeWidth={3} />
      ) : (
        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${colors.textMuted}` }} />
      )}
    </button>
  )
}

export function ExpandableRow({
  title,
  subtitle,
  right,
  expanded,
  onToggle,
  children,
  completed,
}: {
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  completed?: boolean
}) {
  return (
    <div
      style={{
        ...trackerSurface,
        borderRadius: radius.md,
        border: `1px solid ${completed ? 'rgba(34,197,94,0.18)' : colors.borderSubtle}`,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: colors.textPrimary,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
            {subtitle && <div style={{ marginTop: 4, fontSize: 12, color: colors.textMuted }}>{subtitle}</div>}
          </div>
          <ChevronDown
            size={20}
            color={colors.textMuted}
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: transition('fast', 'transform'),
              flexShrink: 0,
            }}
          />
        </button>
        {right}
      </div>
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${colors.borderSubtle}` }}>{children}</div>
      )}
    </div>
  )
}

export function MacroChip({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  if (value == null) return null
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: radius.sm,
        background: colors.bgCard,
        border: `1px solid ${colors.borderSubtle}`,
        textAlign: 'center',
        flex: '1 1 70px',
      }}
    >
      <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 500, color: colors.textMuted }}>{unit}</span>}
      </div>
    </div>
  )
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '12px 10px',
        borderRadius: radius.sm,
        background: colors.bgCard,
        border: `1px solid ${colors.borderSubtle}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: colors.accent }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  )
}

export function ChipSelector<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[]
  value?: T
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '10px 14px',
              borderRadius: radius.full,
              border: `1px solid ${active ? colors.accent : colors.borderSubtle}`,
              background: active ? colors.accentMuted : colors.bgCard,
              color: active ? colors.accent : colors.textSecondary,
              fontWeight: 600,
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** Collapsible folder-style section for top-level tracker categories */
export function TrackerFolder({
  title,
  subtitle,
  icon,
  progress,
  children,
  defaultOpen = false,
  staggerIndex,
  accent,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  progress?: number
  children: ReactNode
  defaultOpen?: boolean
  staggerIndex?: number
  accent?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={`${motionClass.cardEnter} ${staggerIndex != null ? `motion-stagger-${Math.min(staggerIndex, 8)}` : ''}`}
      style={{
        borderRadius: radius.lg,
        marginBottom: spacing[3],
        background: colors.bgGlass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${open && accent ? colors.accentMuted : colors.borderSubtle}`,
        boxShadow: open ? '0 8px 32px rgba(0,0,0,0.35)' : '0 4px 16px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: spacing[4],
          background: open ? 'rgba(255,255,255,0.02)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: colors.textPrimary,
        }}
      >
        {icon && (
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.sm,
              background: colors.accentMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 1.4 }}>{subtitle}</div>
          )}
        </div>
        {progress != null && <MiniRing percent={progress} size={40} done={progress >= 100} />}
        <ChevronDown
          size={22}
          color={colors.textMuted}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: transition('fast', 'transform'),
            flexShrink: 0,
          }}
        />
      </button>
      {open && (
        <div style={{ padding: `0 ${spacing[4]}px ${spacing[4]}px`, borderTop: `1px solid ${colors.borderSubtle}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

/** Nested folder inside workout for pre / main / post sections */
export function TrackerPhaseFolder({
  title,
  subtitle,
  hint,
  progress,
  children,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  accent = colors.accent,
  icon,
}: {
  title: string
  subtitle?: string
  hint?: string
  progress?: number
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  accent?: string
  icon?: ReactNode
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = openProp ?? uncontrolledOpen
  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (openProp == null) setUncontrolledOpen(next)
  }

  return (
    <div
      style={{
        ...trackerSurface,
        borderRadius: radius.md,
        marginBottom: 12,
        overflow: 'hidden',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          background: open ? `${accent}14` : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: colors.textPrimary,
        }}
      >
        {icon ? (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `${accent}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</div>
          {hint && (
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 1.35 }}>{hint}</div>
          )}
          {subtitle && (
            <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: hint ? 4 : 2 }}>{subtitle}</div>
          )}
        </div>
        {progress != null && (
          <span style={{ fontSize: 12, fontWeight: 800, color: accent }}>{progress}%</span>
        )}
        <ChevronDown
          size={18}
          color={colors.textMuted}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: transition('fast', 'transform'),
          }}
        />
      </button>
      {open && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  )
}
