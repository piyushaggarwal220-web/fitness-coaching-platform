'use client';

import { useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import CoachNavbar from '../../../components/CoachNavbar';

const errorBox: CSSProperties = {
  backgroundColor: '#f8d7da',
  color: '#721c24',
  padding: '24px',
  borderRadius: '12px',
  textAlign: 'center',
  margin: '40px auto',
  maxWidth: '480px',
};

const retryBtn: CSSProperties = {
  padding: '10px 20px',
  backgroundColor: '#1a1a2e',
  color: 'white',
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
    console.error('[coach/plan/edit]', error);
  }, [error]);

  return (
    <>
      <CoachNavbar />
      <div style={{ padding: '30px 20px', textAlign: 'center' }}>
        <div style={errorBox}>
          <h2 style={{ margin: '0 0 8px 0' }}>Plan editor error</h2>
          <p style={{ margin: '0 0 16px 0' }}>Something went wrong while loading this plan.</p>
          <button type="button" onClick={reset} style={retryBtn}>
            Try again
          </button>
          <div style={{ marginTop: '16px' }}>
            <Link href="/coach/plans">Back to plans</Link>
          </div>
        </div>
      </div>
    </>
  );
}
