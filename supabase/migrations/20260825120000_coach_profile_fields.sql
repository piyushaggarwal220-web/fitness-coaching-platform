-- Coach public profile fields (bio + display photo path in avatars bucket)

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS display_photo_path text;

COMMENT ON COLUMN public.coaches.bio IS 'Short about text shown to assigned clients.';
COMMENT ON COLUMN public.coaches.display_photo_path IS 'Object path in the avatars bucket.';
