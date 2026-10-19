export function isClientEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function callDayFromMessage(message: string): string | null {
  const match = message.match(/^Call day:\s*(.+)$/m)
  return match?.[1]?.trim() || null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildClientCallConfirmation(input: {
  name: string
  preferredTime: string | null
  message: string
}) {
  const day = callDayFromMessage(input.message)
  const time = input.preferredTime?.trim() || null
  const when = [day, time].filter(Boolean).join(', ')
  const line = when
    ? `A coach will call you on ${when}.`
    : 'A coach will call you on the number you shared.'
  const subject = 'Your LURVOX call is booked'
  const text = [
    `Hi ${input.name},`,
    '',
    'Your call is booked.',
    line,
    '',
    'Please be available and answer the phone when the coach calls.',
    '',
    'LURVOX',
  ].join('\n')
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <p style="margin:0 0 12px">Hi ${escapeHtml(input.name)},</p>
      <p style="margin:0 0 8px"><strong>Your call is booked.</strong></p>
      <p style="margin:0 0 12px">${escapeHtml(line)}</p>
      <p style="margin:0;color:#444">Please be available and answer the phone when the coach calls.</p>
    </div>
  `
  return { subject, text, html }
}
