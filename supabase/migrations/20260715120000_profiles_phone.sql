-- Client phone for office dialing (coaches display in chat; dial from desk phone)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.profiles.phone IS 'Client phone number for office staff to dial (not for in-app calling)';
