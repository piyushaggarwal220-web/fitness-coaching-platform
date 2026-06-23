'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
      email: email,
      password: password,
    });

    if (loginError) {
      setError('❌ ' + loginError.message);
    } else {
      router.push('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Login</h1>
      
      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleLogin} style={styles.form}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      <p style={styles.link}>
        Don't have an account? <a href="/signup" style={styles.linkColor}>Sign Up</a>
      </p>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '30px',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    backgroundColor: 'white',
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#1a1a2e',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  label: {
    fontWeight: 500,
    color: '#333',
  },
  input: {
    padding: '12px',
    border: '1px solid #ccc',
    borderRadius: '5px',
    fontSize: '16px',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '14px',
    backgroundColor: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontSize: '18px',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background 0.3s',
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '12px',
    borderRadius: '5px',
    marginBottom: '15px',
    textAlign: 'center',
  },
  link: {
    textAlign: 'center',
    marginTop: '20px',
    color: '#666',
  },
  linkColor: {
    color: '#e94560',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
};