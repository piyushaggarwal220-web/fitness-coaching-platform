'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAdminRole } from '@/lib/roles'
import { BRAND_ADMIN_LABEL, BRAND_NAME, brandTitle } from '@/lib/brand'
import { authStyles } from '@/lib/auth-styles'
import { PasswordInput } from '@/components/ui/PasswordInput'

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

    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password })

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
    <div style={authStyles.page}>
      <div style={authStyles.card}>
        <div style={authStyles.logo}>{BRAND_NAME}</div>
        <h1 style={authStyles.title}>{brandTitle('Admin Console')}</h1>
        <p style={{ ...authStyles.link, marginTop: 0, marginBottom: 24 }}>{BRAND_ADMIN_LABEL} — platform operations and client management</p>

        {error && <div style={authStyles.error}>{error}</div>}

        <form onSubmit={handleLogin} style={authStyles.form}>
          <div style={authStyles.inputGroup}>
            <label style={authStyles.label}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={authStyles.input} />
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
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
