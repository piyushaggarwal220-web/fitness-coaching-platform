'use client';

import { useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { authenticateClient } from '@/lib/onboarding';
import type { ProfileForm } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileForm>({ name: '', age: '', fitness_goal: '', weight: '', height: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const result = await authenticateClient(supabase, router, { requireOnboarding: true });
      if (!result) return;

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

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        ...profile,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage('❌ Error saving profile: ' + error.message);
    } else {
      setMessage('✅ Profile saved successfully!');
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 20 }}>Loading...</div>;
  }

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 32, marginBottom: 10 }}>👤 Profile Settings</h1>
        <p style={{ color: '#666', marginBottom: 30 }}>Update your fitness profile</p>

        {message && <div style={{ padding: 15, borderRadius: 8, marginBottom: 20, backgroundColor: '#d4edda', color: '#155724' }}>{message}</div>}

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
              <option value="fat_loss">Fat Loss</option>
              <option value="muscle_gain">Muscle Gain</option>
              <option value="recomposition">Recomposition</option>
              <option value="strength">Strength</option>
              <option value="athletic_performance">Athletic Performance</option>
              <option value="lose_weight">Lose Weight</option>
              <option value="build_muscle">Build Muscle</option>
              <option value="stay_fit">Stay Fit</option>
              <option value="increase_stamina">Increase Stamina</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 15 }}>
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