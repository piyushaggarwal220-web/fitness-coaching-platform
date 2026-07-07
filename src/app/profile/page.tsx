'use client';

import { useEffect, useState } from 'react';
import { type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { authenticateClient, FITNESS_GOAL_OPTIONS } from '@/lib/onboarding';
import { requestComplexityRecalculation } from '@/lib/complexity/client';
import { createClient } from '@/lib/supabase/client';
import type { ProfileForm } from '@/types/database';

const supabase = createClient();

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileForm>({ name: '', age: '', fitness_goal: '', weight: '', height: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true, requirePayment: true });
      if (!result) {
        setLoading(false);
        return;
      }

      setUser(result.user as User);

      if (result.profile) {
        setProfile({
          name: result.profile.name || '',
          age: result.profile.age != null ? String(result.profile.age) : '',
          fitness_goal: result.profile.fitness_goal || '',
          weight: result.profile.weight != null ? String(result.profile.weight) : '',
          height: result.profile.height != null ? String(result.profile.height) : '',
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
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage('❌ Error saving profile: ' + error.message);
    } else {
      await requestComplexityRecalculation({ trigger: 'profile_edit_client' });
      setMessage('✅ Profile saved successfully!');
    }
    setSaving(false);
  };

  const isError = message.startsWith('❌');

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 20 }}>Loading...</div>;
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 32, marginBottom: 10 }}>👤 Profile Settings</h1>
        <p style={{ color: '#666', marginBottom: 30 }}>Update your fitness profile</p>

        {message && (
          <div style={{
            padding: 15,
            borderRadius: 8,
            marginBottom: 20,
            backgroundColor: isError ? '#f8d7da' : '#d4edda',
            color: isError ? '#721c24' : '#155724',
          }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: 30, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Full Name</label>
            <input type="text" name="name" value={profile.name} onChange={handleChange} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} placeholder="Enter your name" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Age</label>
            <input type="number" name="age" value={profile.age} onChange={handleChange} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} placeholder="Enter your age" />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Fitness Goal</label>
            <select name="fitness_goal" value={profile.fitness_goal} onChange={handleChange} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, backgroundColor: 'white' }}>
              <option value="">Select your goal</option>
              {FITNESS_GOAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Weight (kg)</label>
              <input type="number" name="weight" value={profile.weight} onChange={handleChange} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} placeholder="70" />
            </div>
            <div style={{ flex: 1, marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 500 }}>Height (cm)</label>
              <input type="number" name="height" value={profile.height} onChange={handleChange} style={{ width: '100%', padding: 12, border: '1px solid #ddd', borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} placeholder="175" />
            </div>
          </div>

          <button type="submit" disabled={saving} style={{ width: '100%', padding: 14, backgroundColor: '#e94560', color: 'white', border: 'none', borderRadius: 8, fontSize: 18, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </>
  );
}