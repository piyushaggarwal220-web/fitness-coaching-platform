import type { CSSProperties } from 'react'
import { colors, layout } from '@/lib/design-tokens'

/** Shared viewport-filling chat layout — uses dvh for mobile browser chrome. */
export const chatLayoutStyles = {
  viewport: {
    position: 'fixed',
    top: `calc(${layout.topBarHeight}px + env(safe-area-inset-top, 0px))`,
    left: 0,
    right: 0,
    bottom: 'var(--chat-vv-offset, 0px)',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bgPrimary,
    zIndex: 50,
    maxWidth: layout.maxWidthWide,
    margin: '0 auto',
    overflow: 'hidden',
    minHeight: 0,
  } satisfies CSSProperties,

  coachViewport: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    height: 'min(640px, calc(100dvh - 200px - env(safe-area-inset-top, 0px)))',
    borderRadius: 16,
    overflow: 'hidden',
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgCard,
  } satisfies CSSProperties,

  threadFill: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  } satisfies CSSProperties,
} as const
