'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchClientProfile, getClientPostAuthPath } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import { authStyles } from '@/lib/auth-styles';

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    router.push(getClientPostAuthPath(profile, profileError ?? undefined));
    setLoading(false);
  };

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>Coach</div>
        <h1 style={authStyles.title}>Welcome back</h1>

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
