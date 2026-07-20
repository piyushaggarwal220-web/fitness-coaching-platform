'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BRAND_NAME, brandTitle } from '@/lib/brand';
import { authStyles } from '@/lib/auth-styles';
import { PasswordInput } from '@/components/ui/PasswordInput';

const supabase = createClient();

export default function CoachLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
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

    const { data: coachData, error: coachError } = await supabase
      .from('coaches')
      .select('*')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (coachError) {
      setError('Could not verify coach account: ' + coachError.message);
      await supabase.auth.signOut();
    } else if (coachData) {
      router.push('/coach/dashboard');
    } else {
      setError('Not a coach account. Please use client login.');
      await supabase.auth.signOut();
    }
    setLoading(false);
  };

  return (
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Coach sign in')}</h1>

        {error && <div style={authStyles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={authStyles.form}>
          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={authStyles.input} autoComplete="email" />
          </div>

          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              inputStyle={authStyles.input}
              name="passcode"
              aria-label="Password"
              autoComplete="off"
            />
          </div>

          <button type="submit" disabled={loading} style={{ ...authStyles.button, opacity: loading ? 0.6 : 1 }} className="btn-press">
            {loading ? 'Logging in...' : 'Sign in'}
          </button>
        </form>

        <p style={authStyles.link}>
          Not a coach? <Link href="/login" style={authStyles.linkColor}>Client login</Link>
        </p>
      </div>
    </div>
  );
}
