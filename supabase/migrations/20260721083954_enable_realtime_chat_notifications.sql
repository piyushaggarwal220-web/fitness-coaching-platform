-- Stream chat and in-app notification changes through Supabase Realtime.
-- Existing RLS policies remain the authorization boundary for subscribers.
DO $$
DECLARE
  realtime_table text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH realtime_table IN ARRAY ARRAY[
    'conversation_messages',
    'coach_conversations',
    'user_notifications'
  ]
  LOOP
    IF to_regclass(format('public.%I', realtime_table)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = realtime_table
      )
    THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        realtime_table
      );
    END IF;
  END LOOP;
END
$$;

-- Keep the default replica identity. INSERT/UPDATE payloads include the new row,
-- while DELETE remains a primary-key-only refetch signal and exposes no old row.
