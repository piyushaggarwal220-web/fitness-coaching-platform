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

export default function PlanEditorError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error('[coach/plan]', error);
  }, [error]);

  return (
    <CoachShell narrow>
      <div style={{ textAlign: 'center' }}>
        <div style={errorBox}>
          <h2 style={{ margin: '0 0 8px 0' }}>Plan editor error</h2>
          <p style={{ margin: '0 0 16px 0' }}>Something went wrong while loading the plan editor.</p>
          <button type="button" onClick={reset} style={retryBtn}>
            Try again
          </button>
          <div style={{ marginTop: '16px' }}>
            <Link href="/coach/plans" style={{ color: colors.accent }}>Back to plans</Link>
          </div>
        </div>
      </div>
    </CoachShell>
  );
}
