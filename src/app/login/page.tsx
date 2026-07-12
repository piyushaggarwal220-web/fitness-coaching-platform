'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchClientProfile, getClientPostAuthPath } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { BRAND_NAME, brandTitle } from '@/lib/brand';
import { authStyles } from '@/lib/auth-styles';
import { colors } from '@/lib/design-tokens';

const supabase = createClient();

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionExpired = searchParams.get('expired') === '1';
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    if (!data.user) {
      setError('Login failed. Please try again.');
      setLoading(false);
      return;
    }

    await supabase.auth.getSession();

    const { profile, error: profileError } = await fetchClientProfile(supabase, data.user.id);

    router.refresh();
    const destination = profileError || !profile
      ? redirectTo.startsWith('/') ? redirectTo : '/dashboard'
      : getClientPostAuthPath(profile, profileError ?? undefined);
    router.push(destination);
    setLoading(false);
  };

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Welcome back')}</h1>

        {sessionExpired && (
          <div style={{
            backgroundColor: colors.warningMuted,
            color: colors.warning,
            padding: '12px 16px',
            borderRadius: 12,
            fontSize: 14,
            marginBottom: 16,
            lineHeight: 1.5,
          }}>
            Your session expired. Please sign in again.
          </div>
        )}

        {error && <div style={authStyles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={authStyles.form}>
          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="email"
            />
          </div>

          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" disabled={loading} style={{ ...authStyles.button, opacity: loading ? 0.6 : 1 }} className="btn-press">
            {loading ? 'Logging in...' : 'Sign in'}
          </button>
        </form>

        <p style={authStyles.link}>
          Don&apos;t have an account?{' '}
          <Link href="/checkout?plan=6_months" style={authStyles.linkColor}>Get started</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={authStyles.page}><div style={authStyles.card}>Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
