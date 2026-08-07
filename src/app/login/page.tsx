'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchClientProfile, getClientPostAuthPath, isOnboardingComplete } from '@/lib/onboarding';
import { hasClientEntitlement } from '@/lib/entitlements';
import { createClient } from '@/lib/supabase/client';
import { BRAND_NAME, brandTitle } from '@/lib/brand';
import { authStyles } from '@/lib/auth-styles';
import { colors } from '@/lib/design-tokens';
import { safeInternalPath } from '@/lib/safe-navigation';
import { sanitizeAuthPasswordError } from '@/lib/auth-password-errors';
import { PasswordInput } from '@/components/ui/PasswordInput';

const supabase = createClient();

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionExpired = searchParams.get('expired') === '1';
  const linkedPurchase = searchParams.get('linked') === '1';
  const redirectTo = safeInternalPath(searchParams.get('redirect'), '/dashboard');

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password,
    });

    // Session can succeed even when Auth attaches a weak/leaked-password warning.
    if (data.user) {
      const { invalidateSessionCache } = await import('@/lib/session-restore')
      invalidateSessionCache()
      await supabase.auth.getSession();
      const { profile, error: profileError } = await fetchClientProfile(supabase, data.user.id);
      router.refresh();

      const role = profile?.role;
      if (role === 'coach') {
        router.push('/coach');
        setLoading(false);
        return;
      }
      if (role === 'admin' || role === 'super_admin') {
        router.push('/admin');
        setLoading(false);
        return;
      }

      const postAuth = profileError || !profile
        ? '/dashboard'
        : getClientPostAuthPath(profile, profileError ?? undefined);

      const canHonourRedirect =
        profile != null &&
        !profileError &&
        hasClientEntitlement(profile) &&
        isOnboardingComplete(profile) &&
        redirectTo !== '/dashboard' &&
        redirectTo !== '/login';

      router.push(canHonourRedirect ? redirectTo : postAuth);
      setLoading(false);
      return;
    }

    if (loginError) {
      const raw = loginError.message || ''
      const looksInvalid = /invalid login credentials|invalid_credentials|email not confirmed/i.test(raw)
      if (looksInvalid) {
        setError(
          'Email or password is incorrect. If you just paid, use the password you set on Create account — or reset it below.'
        )
      } else {
        const safe = sanitizeAuthPasswordError(raw)
        setError(safe ?? 'Unable to sign in. Check your email and password.')
      }
      setLoading(false)
      return
    }

    setError('Login failed. Please try again.');
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

        {linkedPurchase && (
          <div style={{
            backgroundColor: colors.accentMuted,
            color: colors.accent,
            padding: '12px 16px',
            borderRadius: 12,
            fontSize: 14,
            marginBottom: 16,
            lineHeight: 1.5,
          }}>
            Payment linked to your account. Sign in with your login password. If this password never worked, use Forgot password below to set a new one.
          </div>
        )}

        {searchParams.get('error') === 'auth_callback' && (
          <div style={authStyles.error}>
            That email link expired or was already used.{' '}
            <Link href="/forgot-password" style={authStyles.linkColor}>
              Request a new password reset
            </Link>
            .
          </div>
        )}

        {error && <div style={authStyles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={authStyles.form} autoComplete="off">
          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              style={authStyles.input}
              autoComplete="off"
              name="user_email"
            />
          </div>

          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Login password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              inputStyle={authStyles.input}
              name="password"
              aria-label="Login password"
              autoComplete="current-password"
            />
          </div>

          <p style={{ margin: '-4px 0 12px', textAlign: 'right', fontSize: 13 }}>
            <Link href="/forgot-password" style={authStyles.linkColor}>
              Forgot password?
            </Link>
          </p>

          <button type="submit" disabled={loading} style={{ ...authStyles.button, opacity: loading ? 0.6 : 1 }} className="btn-press">
            {loading ? 'Logging in...' : 'Sign in'}
          </button>
        </form>

        <p style={authStyles.link}>
          Don&apos;t have an account?{' '}
          <Link href="/checkout?plan=6_months" style={authStyles.linkColor}>Get started</Link>
          {' · '}
          <Link href="/enroll" style={authStyles.linkColor}>Have a code?</Link>
        </p>
        <p style={{ ...authStyles.link, marginTop: 8 }}>
          Paid but haven&apos;t set up your account?{' '}
          <Link href="/create-account" style={authStyles.linkColor}>Finish setup</Link>
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
