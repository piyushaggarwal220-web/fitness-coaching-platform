/** Open (or create) a coach↔client conversation, then return the thread href. */
export async function openCoachChatWithClient(
  clientId: string
): Promise<{ href: string } | { error: string }> {
  const res = await fetch('/api/chat/coach-conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ clientId }),
  })
  const data = (await res.json().catch(() => null)) as
    | { conversation?: { id?: string }; error?: string }
    | null
  if (!res.ok || !data?.conversation?.id) {
    return { error: data?.error ?? 'Could not open chat with this client.' }
  }
  return { href: `/coach/chat/${data.conversation.id}` }
}
