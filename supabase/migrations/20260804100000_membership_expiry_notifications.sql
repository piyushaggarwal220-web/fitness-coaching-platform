ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'membership_expiring';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'membership_expired';

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
VALUES
  (
    'membership_expiring',
    'high',
    ARRAY['in_app','web_push']::notification_channel[],
    ARRAY['whatsapp','email']::notification_channel[],
    180,
    0,
    false,
    true
  ),
  (
    'membership_expired',
    'high',
    ARRAY['in_app','web_push']::notification_channel[],
    ARRAY['whatsapp','email']::notification_channel[],
    60,
    0,
    true,
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
