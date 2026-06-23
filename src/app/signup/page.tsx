'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('1. Form submitted!');
    console.log('2. Email:', email);
    
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      console.log('5. Supabase response:', { data, error: signUpError });

      if (signUpError) {
        setError('❌ ' + signUpError.message);
      } else {
        setMessage('✅ Account created! You can now login.');
        setEmail('');
        setPassword('');
      }
    } catch (err: any) {
      setError('❌ Something went wrong: ' + err.message);
    }

    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Create Account</h1>
      
      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
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
          <label style={styles.label}>Password (min 6 characters)</label>
          <input
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Creating...' : 'Sign Up'}
        </button>
      </form>

      <p style={styles.link}>
        Already have an account? <a href="/login" style={styles.linkColor}>Login</a>
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
  success: {
    backgroundColor: '#d4edda',
    color: '#155724',
    padding: '12px',
    borderRadius: '5px',
    marginBottom: '15px',
    textAlign: 'center',
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