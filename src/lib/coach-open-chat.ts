/** Open (or create) a coach↔client conversation, then return the thread href. */
export async function openCoachChatWithClient(
  clientId: string,
  options?: { checkinId?: string | null }
): Promise<{ href: string } | { error: string }> {
  const requestedCheckinId = options?.checkinId?.trim() || undefined
  const res = await fetch('/api/chat/coach-conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ clientId, checkinId: requestedCheckinId }),
  })
  const data = (await res.json().catch(() => null)) as
    | { conversation?: { id?: string }; checkinId?: string | null; error?: string }
    | null
  if (!res.ok || !data?.conversation?.id) {
    return { error: data?.error ?? 'Could not open chat with this client.' }
  }
  const checkinId = data.checkinId?.trim() || requestedCheckinId
  const href = checkinId
    ? `/coach/chat/${data.conversation.id}?checkinId=${encodeURIComponent(checkinId)}`
    : `/coach/chat/${data.conversation.id}`
  return { href }
}
