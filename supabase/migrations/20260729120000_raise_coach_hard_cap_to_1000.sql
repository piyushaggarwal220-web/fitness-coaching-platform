-- Raise coach capacity to 1000 for coaches still on the previous default (500)
-- or with no hard_cap set. Custom caps above 1000 are left unchanged.
UPDATE public.coaches
SET hard_cap = 1000
WHERE hard_cap IS NULL
   OR hard_cap = 500;

ALTER TABLE public.coaches
  ALTER COLUMN hard_cap SET DEFAULT 1000;
