import type { ReactNode } from 'react'

export type IconName =
  | 'clock'
  | 'chat'
  | 'calendar'
  | 'person'
  | 'scatter'
  | 'miss'
  | 'copy'
  | 'card'
  | 'pen'
  | 'phone'
  | 'trend'
  | 'plate'
  | 'dumbbell'
  | 'graph'
  | 'play'
  | 'bottle'
  | 'flame'
  | 'muscle'
  | 'bolt'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const paths: Record<IconName, ReactNode> = {
  clock: (
    <>
      <circle cx="16" cy="16" r="9" {...stroke} />
      <path d="M16 11.5 V16 L19 18" {...stroke} />
    </>
  ),
  chat: (
    <path d="M8 10.5 h16 a2 2 0 0 1 2 2 v7 a2 2 0 0 1-2 2 H14 l-4 3.2 V21.5 H8 a2 2 0 0 1-2-2 v-7 a2 2 0 0 1 2-2z" {...stroke} />
  ),
  calendar: (
    <>
      <rect x="7" y="8" width="18" height="16" rx="2" {...stroke} />
      <path d="M7 13 h18 M12 6 v4 M20 6 v4" {...stroke} />
    </>
  ),
  person: (
    <>
      <circle cx="16" cy="11" r="3.2" {...stroke} />
      <path d="M9 23.5 c1.2-4 3.4-6 7-6 s5.8 2 7 6" {...stroke} />
    </>
  ),
  scatter: (
    <>
      <rect x="6" y="7" width="8" height="8" rx="1.4" {...stroke} />
      <rect x="18" y="6" width="8" height="8" rx="1.4" {...stroke} />
      <rect x="12" y="18" width="8" height="8" rx="1.4" {...stroke} />
    </>
  ),
  miss: (
    <>
      <circle cx="16" cy="16" r="9" {...stroke} />
      <path d="M12.5 12.5 l7 7 M19.5 12.5 l-7 7" {...stroke} />
    </>
  ),
  copy: (
    <>
      <rect x="10" y="8" width="13" height="16" rx="1.5" {...stroke} />
      <path d="M8 20 V8.5 A1.5 1.5 0 0 1 9.5 7 H18" {...stroke} />
    </>
  ),
  card: (
    <>
      <rect x="6" y="9" width="20" height="14" rx="2" {...stroke} />
      <path d="M6 14 h20" {...stroke} />
    </>
  ),
  pen: (
    <>
      <path d="M18 7 l7 7 L13 26 H6 v-7 z" {...stroke} />
      <path d="M16 9 l7 7" {...stroke} />
    </>
  ),
  phone: (
    <>
      <rect x="11" y="5" width="10" height="22" rx="2" {...stroke} />
      <path d="M14.5 24.5 h3" {...stroke} />
    </>
  ),
  trend: (
    <path d="M6 22 l7-8 4 4 9-10 M18 8 h8 v8" {...stroke} />
  ),
  plate: (
    <>
      <circle cx="16" cy="16" r="8" {...stroke} />
      <circle cx="16" cy="16" r="3.2" {...stroke} />
    </>
  ),
  dumbbell: (
    <path d="M6 16 h20 M8 12 v8 M12 10 v12 M20 10 v12 M24 12 v8" {...stroke} />
  ),
  graph: (
    <>
      <path d="M7 25 V8 M7 25 h18" {...stroke} />
      <path d="M10 20 l4-5 4 3 6-8" {...stroke} />
    </>
  ),
  play: (
    <>
      <rect x="6" y="7" width="20" height="18" rx="2" {...stroke} />
      <path d="M14 12.5 v7 l6-3.5 z" {...stroke} />
    </>
  ),
  bottle: (
    <>
      <path d="M13 6 h6 M14.5 6 v3 h3 V6" {...stroke} />
      <path d="M12 9 h8 l1.5 4 v11 a2 2 0 0 1-2 2 h-7 a2 2 0 0 1-2-2 V13 z" {...stroke} />
    </>
  ),
  flame: (
    <path d="M16 6 c2 4 2 6 0 8 c3 0 6 3 6 7 a6 6 0 0 1-12 0 c0-3 2-5 4-7 c-1 3-1 4 0 6 c2-2 2-5 2-8 z" {...stroke} />
  ),
  muscle: (
    <path d="M8 18 c0-6 3-10 8-10 s8 4 8 10 c-2 1-3 3-3 5 h-10 c0-2-1-4-3-5z M12 18 h8" {...stroke} />
  ),
  bolt: (
    <path d="M18 5 L10 17 h6 l-2 10 10-14 h-6 z" {...stroke} />
  ),
}

export function Mark({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="st-mark">
      {paths[name]}
    </svg>
  )
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0D0D0D" />
      <path d="M10 8 v16 h11" fill="none" stroke="#FF5A1F" strokeWidth="2.4" strokeLinejoin="miter" />
    </svg>
  )
}
