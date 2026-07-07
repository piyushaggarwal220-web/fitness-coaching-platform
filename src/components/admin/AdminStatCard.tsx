import { adminStyles as s } from '@/lib/admin/styles'

type AdminStatCardProps = {
  label: string
  value: string | number
  hint?: string
  accent?: string
}

export function AdminStatCard({ label, value, hint, accent = '#7c3aed' }: AdminStatCardProps) {
  return (
    <div style={{ ...s.statCard, borderLeftColor: accent }}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
      {hint && <div style={s.statHint}>{hint}</div>}
    </div>
  )
}
