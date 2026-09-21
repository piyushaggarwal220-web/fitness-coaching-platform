'use client'

import { useMemo, useState } from 'react'
import { colors } from '@/lib/design-tokens'
import type { SparkPoint } from '@/lib/jarvis/operator-cockpit'

function formatDay(date: string) {
  const part = date.slice(5)
  const [mo, d] = part.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = Number(mo) - 1
  if (mi < 0 || mi > 11) return date
  return `${months[mi]} ${Number(d)}`
}

export function ExecutiveChart({
  points,
  height = 72,
  unit,
  empty,
}: {
  points: SparkPoint[]
  height?: number
  unit?: string
  empty?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 320
  const padX = 8
  const padY = 8
  const labelH = 14

  const layout = useMemo(() => {
    if (points.length < 2) return null
    const values = points.map((p) => p.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values)
    const span = max - min || 1
    const coords = points.map((p, i) => {
      const x = padX + (i / Math.max(points.length - 1, 1)) * (width - padX * 2)
      const y = padY + (1 - (p.value - min) / span) * (height - padY * 2 - labelH)
      return { x, y, ...p }
    })
    return { coords, last: coords[coords.length - 1] }
  }, [points, height])

  if (!points.length || points.length < 2) {
    return (
      <div style={{ fontSize: 12, color: colors.textMuted, padding: '8px 0' }}>
        {empty || 'No verified points for this period.'}
      </div>
    )
  }
  if (!layout) return null

  const active = hover != null ? layout.coords[hover] : layout.last
  const poly = layout.coords.map((c) => `${c.x},${c.y}`).join(' ')
  const area = `${padX},${height - labelH} ${poly} ${width - padX},${height - labelH}`
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1]

  return (
    <div
      style={{ position: 'relative' }}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * width
          let best = 0
          let bestD = Infinity
          layout.coords.forEach((c, i) => {
            const d = Math.abs(c.x - x)
            if (d < bestD) {
              bestD = d
              best = i
            }
          })
          setHover(best)
        }}
      >
        <polygon fill="rgba(255,255,255,0.04)" points={area} />
        <polyline fill="none" stroke="rgba(250,250,250,0.55)" strokeWidth="1.5" points={poly} />
        {active ? <circle cx={active.x} cy={active.y} r="2.5" fill="#fafafa" /> : null}
        {labelIdx.map((i) => (
          <text
            key={points[i].date}
            x={layout.coords[i].x}
            y={height - 2}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fill={colors.textMuted}
            fontSize="8"
          >
            {formatDay(points[i].date)}
          </text>
        ))}
      </svg>
      {active ? (
        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
          {formatDay(active.date)} ·{' '}
          {unit === '₹'
            ? `₹${Math.round(active.value).toLocaleString('en-IN')}`
            : `${Math.round(active.value).toLocaleString('en-IN')} sales`}
        </div>
      ) : null}
    </div>
  )
}

export function Sparkline(props: { points: SparkPoint[]; width?: number; height?: number; label?: string }) {
  return <ExecutiveChart points={props.points} height={props.height ?? 48} unit={props.label} />
}
