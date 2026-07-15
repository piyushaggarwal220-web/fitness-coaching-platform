'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { ClientShell } from '@/components/ui/ClientShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { authenticateClient, FITNESS_GOAL_OPTIONS } from '@/lib/onboarding';
import { requestComplexityRecalculation } from '@/lib/complexity/client';
import { createClient } from '@/lib/supabase/client';
import { mobileStyles } from '@/lib/mobile-styles';
import { colors, spacing } from '@/lib/design-tokens';
import type { ProfileForm } from '@/types/database';

const supabase = createClient();

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileForm>({ name: '', age: '', fitness_goal: '', weight: '', height: '', phone: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) { setLoading(false); return; }

      setUser(result.user as User);
      if (result.profile) {
        setProfile({
          name: result.profile.name || '',
          age: result.profile.age != null ? String(result.profile.age) : '',
          fitness_goal: result.profile.fitness_goal || '',
          weight: result.profile.weight != null ? String(result.profile.weight) : '',
          height: result.profile.height != null ? String(result.profile.height) : '',
          phone: result.profile.phone || '',
        });
      }
      setLoading(false);
    };
    checkUser();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setProfile({ ...profile, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage('');

    const age = profile.age ? parseInt(profile.age, 10) : null;
    const weight = profile.weight ? parseFloat(profile.weight) : null;
    const height = profile.height ? parseFloat(profile.height) : null;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        name: profile.name.trim(),
        age,
        fitness_goal: profile.fitness_goal || null,
        weight,
        height,
        phone: profile.phone.trim() || null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage('Error saving profile: ' + error.message);
    } else {
      await requestComplexityRecalculation({ trigger: 'profile_edit_client' });
      setMessage('Profile saved successfully!');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const isError = message.toLowerCase().includes('error');

  if (loading) return <ClientShell title="Profile" loading />;

  return (
    <ClientShell title="Profile">
      <div style={{ marginBottom: spacing[5] }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          backgroundColor: colors.accentMuted,
          border: `2px solid ${colors.accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 800, color: colors.accent,
          marginBottom: spacing[3],
        }}>
          {(profile.name?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()}
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {profile.name || 'Your Profile'}
        </h1>
        <p style={{ margin: '6px 0 0', color: colors.textSecondary, fontSize: 15 }}>{user?.email}</p>
      </div>

      {message && (
        <div style={isError ? mobileStyles.error : mobileStyles.success}>{message}</div>
      )}

      <form onSubmit={handleSubmit}>
        <Card variant="elevated">
          <Input label="Full Name" type="text" name="name" value={profile.name} onChange={handleChange} placeholder="Enter your name" />
          <Input
            label="Phone"
            type="tel"
            name="phone"
            value={profile.phone}
            onChange={handleChange}
            placeholder="+91 98765 43210"
          />
          <Input label="Age" type="number" name="age" value={profile.age} onChange={handleChange} placeholder="Enter your age" />

          <div style={{ marginBottom: spacing[3] }}>
            <label style={{ display: 'block', marginBottom: spacing[1], fontSize: 14, fontWeight: 500, color: colors.textSecondary }}>
              Fitness Goal
            </label>
            <select
              name="fitness_goal"
              value={profile.fitness_goal}
              onChange={handleChange}
              style={{
                width: '100%', minHeight: 56, padding: '12px 16px',
                border: `1px solid ${colors.borderSubtle}`, borderRadius: 12,
                fontSize: 16, backgroundColor: colors.bgElevated, color: colors.textPrimary,
              }}
            >
              <option value="">Select your goal</option>
              {FITNESS_GOAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing[3] }}>
            <Input label="Weight (kg)" type="number" name="weight" value={profile.weight} onChange={handleChange} placeholder="70" />
            <Input label="Height (cm)" type="number" name="height" value={profile.height} onChange={handleChange} placeholder="175" />
          </div>

          <Button type="submit" loading={saving} fullWidth>Save Profile</Button>
        </Card>
      </form>

      <div style={{ marginTop: spacing[4] }}>
        <Button variant="ghost" fullWidth onClick={handleLogout} style={{ color: colors.danger }}>
          <LogOut size={18} /> Sign Out
        </Button>
      </div>
    </ClientShell>
  );
}
