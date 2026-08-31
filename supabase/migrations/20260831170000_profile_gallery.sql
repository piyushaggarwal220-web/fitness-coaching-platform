-- Client profile photo gallery (paths in avatars bucket under {user_id}/gallery/*).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_gallery_paths jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.profile_gallery_paths IS
  'Up to 6 gallery image paths in avatars bucket. Shown on client profile.';
