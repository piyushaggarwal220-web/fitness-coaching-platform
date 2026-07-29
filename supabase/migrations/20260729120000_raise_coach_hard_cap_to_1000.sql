-- Raise coach capacity to 1000 for any coach below that target
-- (covers prior defaults of NULL / 100 / 500). Caps already >= 1000 are left alone.
UPDATE public.coaches
SET hard_cap = 1000
WHERE hard_cap IS NULL
   OR hard_cap < 1000;

ALTER TABLE public.coaches
  ALTER COLUMN hard_cap SET DEFAULT 1000;
