'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAdminRole } from '@/lib/roles'

const supabase = createClient()

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('Login failed. Please try again.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()

    if (profileError) {
      setError('Could not verify admin account.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (!isAdminRole(profile?.role)) {
      setError('Not an admin account.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    router.push('/admin/dashboard')
    setLoading(false)
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Console</h1>
      <p style={styles.subtitle}>Platform operations and client management</p>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleLogin} style={styles.form}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: 420,
    margin: '60px auto',
    padding: 32,
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    backgroundColor: 'white',
  },
  title: { textAlign: 'center', margin: '0 0 8px 0', color: '#1a1a2e', fontSize: 26 },
  subtitle: { textAlign: 'center', margin: '0 0 28px 0', color: '#666', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 500, color: '#333', fontSize: 14 },
  input: {
    padding: 12,
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 16,
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: 14,
    backgroundColor: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  error: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
}
