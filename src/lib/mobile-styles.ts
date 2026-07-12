/** Shared mobile-first styles and utilities. */

import type { CSSProperties } from 'react'

export const MOBILE_BREAKPOINT = 768

export const mobileStyles = {
  page: {
    minHeight: '100vh',
    padding: '16px',
    paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
  } satisfies CSSProperties,

  container: {
    maxWidth: 800,
    margin: '0 auto',
    width: '100%',
  } satisfies CSSProperties,

  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    marginBottom: 16,
  } satisfies CSSProperties,

  title: {
    fontSize: 'clamp(1.25rem, 4vw, 1.75rem)',
    fontWeight: 700,
    color: '#1a1a2e',
    margin: '0 0 8px',
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
    color: '#666',
    margin: '0 0 16px',
    lineHeight: 1.5,
  } satisfies CSSProperties,

  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    padding: '12px 24px',
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    touchAction: 'manipulation',
  } satisfies CSSProperties,

  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
    padding: '12px 24px',
    backgroundColor: 'white',
    color: '#1a1a2e',
    border: '1px solid #ddd',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    touchAction: 'manipulation',
  } satisfies CSSProperties,

  input: {
    width: '100%',
    minHeight: 48,
    padding: '12px 16px',
    border: '1px solid #ddd',
    borderRadius: 10,
    fontSize: 16,
    boxSizing: 'border-box' as const,
  } satisfies CSSProperties,

  stickyBottom: {
    position: 'sticky' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    backgroundColor: 'white',
    borderTop: '1px solid #eee',
    zIndex: 50,
  } satisfies CSSProperties,

  empty: {
    textAlign: 'center' as const,
    padding: '48px 24px',
    color: '#888',
  } satisfies CSSProperties,

  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    color: '#666',
    fontSize: 16,
  } satisfies CSSProperties,

  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px 16px',
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 14,
  } satisfies CSSProperties,

  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px 16px',
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 14,
  } satisfies CSSProperties,
}

export const mobileNavStyles = `
  .mobile-nav-links { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .mobile-nav-btn { display: none; font-size: 28px; background: none; border: none; color: white; cursor: pointer; min-width: 48px; min-height: 48px; }
  @media (max-width: 767px) {
    .mobile-nav-links { display: none; flex-direction: column; width: 100%; margin-top: 12px; gap: 4px; align-items: stretch; }
    .mobile-nav-links.open { display: flex; }
    .mobile-nav-btn { display: flex; align-items: center; justify-content: center; }
    .mobile-nav-links a, .mobile-nav-links button { padding: 12px 16px !important; min-height: 48px; }
  }
`
