'use client';

import { useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { CoachShell } from '@/components/ui/CoachShell';
import { colors } from '@/lib/design-tokens';

const errorBox: CSSProperties = {
  backgroundColor: colors.dangerMuted,
  color: colors.danger,
  padding: '24px',
  borderRadius: '12px',
  textAlign: 'center',
  margin: '40px auto',
  maxWidth: '480px',
};

const retryBtn: CSSProperties = {
  padding: '10px 20px',
  backgroundColor: colors.accent,
  color: colors.textInverse,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '14px',
  marginTop: '12px',
};

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function CoachDashboardError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error('[coach/dashboard]', error);
  }, [error]);

  return (
    <CoachShell>
      <div style={{ textAlign: 'center' }}>
        <div style={errorBox}>
          <h2 style={{ margin: '0 0 8px 0' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 16px 0' }}>We could not load the coach dashboard. Please try again.</p>
          <button type="button" onClick={reset} style={retryBtn}>
            Try again
          </button>
          <div style={{ marginTop: '16px' }}>
            <Link href="/coach/clients" style={{ color: colors.accent }}>View clients</Link>
          </div>
        </div>
      </div>
    </CoachShell>
  );
}
