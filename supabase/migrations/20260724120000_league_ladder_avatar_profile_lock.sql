-- League ladder divisions, avatar, weekly profile settings lock

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS league_division text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS profile_settings_edited_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_league_division_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_league_division_check
  CHECK (
    league_division IN (
      'bronze', 'silver', 'gold', 'platinum', 'diamond',
      'crazy_1', 'crazy_2', 'crazy_3', 'world'
    )
  );

COMMENT ON COLUMN public.profiles.league_division IS
  'Current Consistency League ladder division (monthly seasons; top 10% promote).';
COMMENT ON COLUMN public.profiles.avatar_path IS
  'Storage path for client profile photo (onboarding-photos bucket).';
COMMENT ON COLUMN public.profiles.profile_settings_edited_at IS
  'Last time the client saved profile settings; limited to once per 7 days.';

-- Migrate legacy standing tier names
UPDATE public.league_standings SET tier = 'bronze' WHERE tier IN ('foundation', 'Bronze');
UPDATE public.league_standings SET tier = 'silver' WHERE tier IN ('steady', 'Silver');
UPDATE public.league_standings SET tier = 'gold' WHERE tier IN ('momentum', 'Gold');
UPDATE public.league_standings SET tier = 'platinum' WHERE tier IN ('champion', 'Platinum');

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read avatars" ON storage.objects;
CREATE POLICY "Users read avatars"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
