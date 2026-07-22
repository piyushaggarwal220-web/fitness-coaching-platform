import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/api-auth'
import { requireConversationParticipantForUser } from '@/lib/chat-api-access'
import { extractStorageObjectPath } from '@/lib/storage/media-url'
import { createAdminClient } from '@/lib/supabase/admin'

const VOICE_BUCKET = 'chat-voice'

/**
 * Sign a chat-voice object for a conversation participant.
 * Uses service role after access check so playback does not depend on
 * storage RLS quirks (e.g. unqualified `name` resolving to coaches.name).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversationId')?.trim()
  const pathOrUrl = searchParams.get('path')?.trim()

  if (!conversationId || !pathOrUrl) {
    return NextResponse.json(
      { error: 'conversationId and path are required' },
      { status: 400 }
    )
  }

  const access = await requireConversationParticipantForUser(conversationId, auth.user.id)
  if (!access.ok) return access.response

  const objectPath = extractStorageObjectPath(pathOrUrl, VOICE_BUCKET) ?? (
    !pathOrUrl.includes('://') && !pathOrUrl.startsWith('/')
      ? pathOrUrl.replace(/^\/+/, '')
      : null
  )

  if (!objectPath) {
    return NextResponse.json({ error: 'Invalid voice path' }, { status: 400 })
  }

  // Path format: {uploaderId}/{conversationId}/{filename}
  const segments = objectPath.split('/')
  if (segments.length < 3 || segments[1] !== conversationId) {
    return NextResponse.json({ error: 'Voice path does not match conversation' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(VOICE_BUCKET)
    .createSignedUrl(objectPath, 60 * 60)

  if (error || !data?.signedUrl) {
    console.error('[chat-voice] sign failed', error?.message)
    return NextResponse.json(
      { error: 'Voice message is temporarily unavailable. Please retry.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url: data.signedUrl })
}
