'use client';

import { useEffect, type CSSProperties } from 'react';
import Link from 'next/link';

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

export default function DashboardError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error('[dashboard]', error);
  }, [error]);

  return (
    <div style={{ padding: '30px 20px', textAlign: 'center' }}>
      <div style={errorBox}>
        <h2 style={{ margin: '0 0 8px 0' }}>Something went wrong</h2>
        <p style={{ margin: '0 0 16px 0' }}>We could not load your dashboard. Please try again.</p>
        <button type="button" onClick={reset} style={retryBtn}>
          Try again
        </button>
        <div style={{ marginTop: '16px' }}>
          <Link href="/">Return home</Link>
        </div>
      </div>
    </div>
  );
}
