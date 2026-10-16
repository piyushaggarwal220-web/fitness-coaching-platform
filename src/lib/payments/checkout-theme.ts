import type { CSSProperties } from 'react'
import {
  PREVIEW2_AD_PATH,
  PREVIEW3_AD_PATH,
  PREVIEW_AD_PATH,
  type PreviewAdPath,
} from '@/lib/analytics/ad-landing'

export type CheckoutTheme = {
  page: CSSProperties
  card: CSSProperties
  backLink: CSSProperties
  brandMark: CSSProperties
  eyebrow: CSSProperties
  title: CSSProperties
  subtitle: CSSProperties
  screenDot: CSSProperties
  dotActive: CSSProperties
  trustStrip: CSSProperties
  trustBadge: CSSProperties
  trustLine: CSSProperties
  planChip: CSSProperties
  planChipSelected: CSSProperties
  planChipName: CSSProperties
  planChipDuration: CSSProperties
  planChipPrice: CSSProperties
  planChipPopular: CSSProperties
  planChipBest: CSSProperties
  orderSummary: CSSProperties
  orderPlanName: CSSProperties
  orderPlanMeta: CSSProperties
  orderSummaryPrice: CSSProperties
  sectionLabel: CSSProperties
  label: CSSProperties
  input: CSSProperties
  payBtn: CSSProperties
  paySecureNote: CSSProperties
  stickyPayBar: CSSProperties
  stickyPayLabel: CSSProperties
  stickyPayAmount: CSSProperties
  stickyPayBtn: CSSProperties
  stickyPayNote: CSSProperties
  secure: CSSProperties
  inlineLink: CSSProperties
  otpBox: CSSProperties
  otpTitle: CSSProperties
  otpHint: CSSProperties
  otpInput: CSSProperties
  otpBtn: CSSProperties
  otpBtnSecondary: CSSProperties
  policyText: CSSProperties
  honestNote: CSSProperties
}

type Palette = {
  page: string
  pageImage: string
  ink: string
  muted: string
  dim: string
  card: string
  wash: string
  line: string
  accent: string
  accentText: string
  button: string
  buttonText: string
  buttonImage: string
  buttonShadow: string
  dot: string
  colorScheme: 'light' | 'dark'
  fontFamily: string
  titleFamily: string
  titleSize: number
  titleWeight: number
  titleTracking: string
  titleLine: number
  bodySize: number
  labelSize: number
  buttonSize: number
  buttonWeight: number
  buttonRadius: number
  buttonHeight: number
  brandSize: number
  brandTracking: string
  badgeBg: string
  badgeBorder: string
  badgeColor: string
}

function themeFrom(palette: Palette): CheckoutTheme {
  const button: CSSProperties = {
    backgroundColor: palette.button,
    backgroundImage: palette.buttonImage,
    color: palette.buttonText,
    borderRadius: palette.buttonRadius,
    fontWeight: palette.buttonWeight,
    fontSize: palette.buttonSize,
    minHeight: palette.buttonHeight,
    boxShadow: palette.buttonShadow,
    fontFamily: palette.fontFamily,
  }
  const field: CSSProperties = {
    backgroundColor: palette.card,
    border: `1px solid ${palette.line}`,
    color: palette.ink,
    borderRadius: palette.buttonRadius,
    colorScheme: palette.colorScheme,
    fontSize: palette.bodySize,
    fontFamily: palette.fontFamily,
  }
  return {
    page: {
      backgroundColor: palette.page,
      backgroundImage: palette.pageImage,
      fontFamily: palette.fontFamily,
      fontSize: palette.bodySize,
      color: palette.ink,
    },
    card: {
      backgroundColor: palette.card,
      border: `1px solid ${palette.line}`,
      boxShadow: 'none',
      overflowX: 'hidden',
      minWidth: 0,
    },
    backLink: { color: palette.muted, fontSize: palette.labelSize },
    brandMark: {
      color: palette.accent,
      textAlign: 'center',
      fontFamily: palette.titleFamily,
      fontSize: palette.brandSize,
      letterSpacing: palette.brandTracking,
    },
    eyebrow: {
      margin: '0 auto 8px',
      display: 'block',
      width: 'fit-content',
      padding: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
      color: palette.accent,
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: '0.08em',
      textAlign: 'center',
      fontFamily: palette.fontFamily,
    },
    title: {
      color: palette.ink,
      textAlign: 'center',
      fontFamily: palette.titleFamily,
      fontSize: palette.titleSize,
      fontWeight: palette.titleWeight,
      letterSpacing: palette.titleTracking,
      lineHeight: palette.titleLine,
    },
    subtitle: {
      color: palette.muted,
      textAlign: 'center',
      fontSize: palette.bodySize,
      fontFamily: palette.fontFamily,
    },
    screenDot: { backgroundColor: palette.dot },
    dotActive: { backgroundColor: palette.accent },
    trustStrip: {
      backgroundColor: palette.wash,
      border: `1px solid ${palette.line}`,
    },
    trustBadge: {
      backgroundColor: palette.card,
      border: `1px solid ${palette.accent}`,
      color: palette.ink,
    },
    trustLine: { color: palette.muted },
    planChip: {
      backgroundColor: palette.card,
      border: `1px solid ${palette.line}`,
      color: palette.ink,
    },
    planChipSelected: {
      backgroundColor: palette.card,
      border: `2px solid ${palette.accent}`,
      borderColor: palette.accent,
      boxShadow: 'none',
    },
    planChipName: { color: palette.ink },
    planChipDuration: { color: palette.dim },
    planChipPrice: { color: palette.ink },
    planChipPopular: {
      fontSize: 11,
      fontWeight: 700,
      color: palette.badgeColor,
      backgroundColor: palette.badgeBg,
      border: palette.badgeBorder,
      textDecoration: 'none',
    },
    planChipBest: {
      fontSize: 11,
      fontWeight: 700,
      color: palette.badgeColor,
      backgroundColor: palette.badgeBg,
      border: palette.badgeBorder,
      textDecoration: 'none',
    },
    orderSummary: {
      backgroundColor: palette.wash,
      border: `1px solid ${palette.line}`,
    },
    orderPlanName: { color: palette.ink },
    orderPlanMeta: { color: palette.muted },
    orderSummaryPrice: { color: palette.ink },
    sectionLabel: {
      color: palette.accent,
      textAlign: 'center',
      fontSize: 12,
      fontFamily: palette.fontFamily,
    },
    label: {
      color: palette.ink,
      fontSize: palette.labelSize,
      fontFamily: palette.fontFamily,
    },
    input: field,
    payBtn: button,
    paySecureNote: { color: palette.dim },
    stickyPayBar: {
      backgroundColor: palette.page,
      borderTop: `1px solid ${palette.line}`,
    },
    stickyPayLabel: { color: palette.dim },
    stickyPayAmount: { color: palette.ink },
    stickyPayBtn: button,
    stickyPayNote: { color: palette.dim },
    secure: { color: palette.dim, fontSize: palette.labelSize },
    inlineLink: { color: palette.accent },
    otpBox: {
      backgroundColor: palette.wash,
      border: `1px solid ${palette.line}`,
    },
    otpTitle: { color: palette.ink, fontFamily: palette.titleFamily },
    otpHint: { color: palette.muted, fontSize: palette.bodySize },
    otpInput: field,
    otpBtn: button,
    otpBtnSecondary: {
      border: `1px solid ${palette.line}`,
      color: palette.ink,
      backgroundColor: palette.card,
      borderRadius: palette.buttonRadius,
      fontFamily: palette.fontFamily,
    },
    policyText: { color: palette.muted },
    honestNote: {
      margin: '12px 0 0',
      fontSize: palette.labelSize,
      lineHeight: 1.45,
      color: palette.muted,
    },
  }
}

const sharedType = {
  titleSize: 28,
  titleWeight: 800,
  titleTracking: '0',
  titleLine: 1.15,
  bodySize: 15,
  labelSize: 13,
  buttonSize: 17,
  buttonWeight: 600,
  buttonRadius: 12,
  buttonHeight: 52,
  brandSize: 13,
  brandTracking: '0.14em',
  badgeBg: 'rgba(30, 77, 61, 0.08)',
  badgeBorder: '1px solid rgba(30, 77, 61, 0.28)',
  badgeColor: '#1e4d3d',
}

export function checkoutThemeForLanding(
  path: PreviewAdPath | null,
  fonts: { manrope: string; inter: string },
): CheckoutTheme {
  const manrope = fonts.manrope
  const display = `"General Sans", ${fonts.inter}, sans-serif`

  if (path === PREVIEW_AD_PATH) {
    return themeFrom({
      page: '#fafafa',
      pageImage: 'none',
      ink: '#0d0d0d',
      muted: '#5c5c5c',
      dim: '#5c5c5c',
      card: '#ffffff',
      wash: '#ffe8dc',
      line: 'rgba(13, 13, 13, 0.1)',
      accent: '#ff5a1f',
      accentText: '#ffffff',
      button: '#ff5a1f',
      buttonText: '#ffffff',
      buttonImage: 'none',
      buttonShadow: '0 10px 30px rgba(255, 90, 31, 0.28)',
      dot: 'rgba(255, 90, 31, 0.28)',
      colorScheme: 'light',
      fontFamily: fonts.inter,
      titleFamily: display,
      titleSize: 32,
      titleWeight: 600,
      titleTracking: '-0.045em',
      titleLine: 0.98,
      bodySize: 17,
      labelSize: 14,
      buttonSize: 15,
      buttonWeight: 650,
      buttonRadius: 14,
      buttonHeight: 52,
      brandSize: 14,
      brandTracking: '0.12em',
      badgeBg: '#ffe8dc',
      badgeBorder: '1px solid rgba(255, 90, 31, 0.35)',
      badgeColor: '#e04e00',
    })
  }

  if (path === PREVIEW2_AD_PATH) {
    return themeFrom({
      page: '#121216',
      pageImage:
        'radial-gradient(90% 50% at 100% 0%, rgba(124, 58, 237, 0.28), transparent 70%)',
      ink: '#f5f3ee',
      muted: '#a6a6b0',
      dim: '#75757f',
      card: '#1a1a20',
      wash: '#23232b',
      line: 'rgba(245, 243, 238, 0.12)',
      accent: '#a78bfa',
      accentText: '#ffffff',
      button: '#7c3aed',
      buttonText: '#ffffff',
      buttonImage: 'linear-gradient(100deg, #7c3aed 0%, #9d4edd 100%)',
      buttonShadow: '0 10px 34px rgba(139, 92, 246, 0.38)',
      dot: 'rgba(167, 139, 250, 0.35)',
      colorScheme: 'dark',
      fontFamily: manrope,
      titleFamily: manrope,
      titleSize: 32,
      titleWeight: 800,
      titleTracking: '-0.025em',
      titleLine: 1,
      bodySize: 16,
      labelSize: 15,
      buttonSize: 17,
      buttonWeight: 800,
      buttonRadius: 14,
      buttonHeight: 58,
      brandSize: 15,
      brandTracking: '0.22em',
      badgeBg: 'rgba(139, 92, 246, 0.18)',
      badgeBorder: '1px solid rgba(167, 139, 250, 0.45)',
      badgeColor: '#a78bfa',
    })
  }

  if (path === PREVIEW3_AD_PATH) {
    return themeFrom({
      page: '#12100f',
      pageImage:
        'radial-gradient(ellipse 70% 45% at 85% 0%, rgba(225, 29, 72, 0.22), transparent 55%), radial-gradient(ellipse 55% 40% at 0% 15%, rgba(34, 197, 94, 0.16), transparent 50%), radial-gradient(ellipse 50% 35% at 50% 100%, rgba(251, 191, 36, 0.12), transparent 55%)',
      ink: '#f8fafc',
      muted: '#cbd5e1',
      dim: '#94a3b8',
      card: '#1c1917',
      wash: '#171411',
      line: 'rgba(248, 250, 252, 0.12)',
      accent: '#fbbf24',
      accentText: '#1c1400',
      button: '#16a34a',
      buttonText: '#ffffff',
      buttonImage: 'none',
      buttonShadow: '0 10px 22px rgba(22, 163, 74, 0.28)',
      dot: 'rgba(251, 191, 36, 0.4)',
      colorScheme: 'dark',
      fontFamily: manrope,
      titleFamily: manrope,
      titleSize: 33,
      titleWeight: 800,
      titleTracking: '-0.02em',
      titleLine: 1.08,
      bodySize: 17,
      labelSize: 15,
      buttonSize: 15,
      buttonWeight: 800,
      buttonRadius: 14,
      buttonHeight: 50,
      brandSize: 15,
      brandTracking: '0.14em',
      badgeBg: '#fbbf24',
      badgeBorder: '1px solid #fbbf24',
      badgeColor: '#1c1400',
    })
  }

  const beige = themeFrom({
    page: '#f4efe6',
    pageImage: 'none',
    ink: '#1c1915',
    muted: '#4e4942',
    dim: '#6d675e',
    card: '#fffaf3',
    wash: '#f4efe6',
    line: 'rgba(28, 25, 21, 0.12)',
    accent: '#1e4d3d',
    accentText: '#f4efe6',
    button: '#1e4d3d',
    buttonText: '#f4efe6',
    buttonImage: 'none',
    buttonShadow: 'none',
    dot: 'rgba(30, 77, 61, 0.22)',
    colorScheme: 'light',
    fontFamily: manrope,
    titleFamily: manrope,
    ...sharedType,
  })
  beige.input = { ...beige.input, fontSize: 16 }
  beige.otpInput = { ...beige.otpInput, fontSize: 16 }
  beige.sectionLabel = { ...beige.sectionLabel, fontSize: 11 }
  return beige
}
