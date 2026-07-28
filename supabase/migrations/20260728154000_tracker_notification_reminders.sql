ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tracker_reminder';

INSERT INTO notification_channel_policies (
  event_type,
  priority,
  immediate_channels,
  escalation_channels,
  escalation_delay_minutes,
  digest_window_minutes,
  critical_exception,
  enabled
)
VALUES (
  'tracker_reminder',
  'normal',
  ARRAY['in_app','web_push']::notification_channel[],
  ARRAY[]::notification_channel[],
  360,
  0,
  false,
  true
)
ON CONFLICT (event_type) DO UPDATE SET
  priority = EXCLUDED.priority,
  immediate_channels = EXCLUDED.immediate_channels,
  escalation_channels = EXCLUDED.escalation_channels,
  escalation_delay_minutes = EXCLUDED.escalation_delay_minutes,
  digest_window_minutes = EXCLUDED.digest_window_minutes,
  critical_exception = EXCLUDED.critical_exception,
  enabled = EXCLUDED.enabled,
  updated_at = now();
