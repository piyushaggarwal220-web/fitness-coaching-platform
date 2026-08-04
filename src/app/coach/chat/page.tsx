'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CoachShell } from '@/components/ui/CoachShell'
import { brandTitle } from '@/lib/brand'
import { coachPageStyles as styles } from '@/lib/coach-page-styles'
import { formatRelativeActivity } from '@/lib/coach-chat-ui'
import { openCoachChatWithClient } from '@/lib/coach-open-chat'
import { colors, shadows } from '@/lib/coach-theme'
import { requireCoach } from '@/lib/coach-session'
import { createClient } from '@/lib/supabase/client'
import { useCoachConversationList } from '@/hooks/useCoachConversationList'

const supabase = createClient()

type ClientOption = { id: string; name: string | null; email: string | null }

function CoachChatListInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const clientIdParam = searchParams.get('clientId')
  const checkinIdParam = searchParams.get('checkinId')
  const { conversations, loading, error, retry, reload } = useCoachConversationList({
    realtimeScope: 'chat-list',
  })
  const [clients, setClients] = useState<ClientOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [openingClientId, setOpeningClientId] = useState<string | null>(null)
  const [openError, setOpenError] = useState('')
  const [autoOpening, setAutoOpening] = useState(Boolean(clientIdParam))

  useEffect(() => {
    let active = true
    const loadClients = async () => {
      const coach = await requireCoach(supabase, router)
      if (!active || !coach) return
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('coach_id', coach.id)
        .order('name', { ascending: true })
      if (!active) return
      setClients((data as ClientOption[] | null) ?? [])
    }
    void loadClients()
    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (!clientIdParam || loading) return
    let cancelled = false
    const open = async () => {
      setAutoOpening(true)
      setOpenError('')
      const result = await openCoachChatWithClient(clientIdParam, {
        checkinId: checkinIdParam,
      })
      if (cancelled) return
      if ('error' in result) {
        setOpenError(result.error)
        setAutoOpening(false)
        return
      }
      router.replace(result.href)
    }
    void open()
    return () => {
      cancelled = true
    }
  }, [checkinIdParam, clientIdParam, loading, router])

  const conversationClientIds = useMemo(
    () => new Set(conversations.map((c) => c.client_id)),
    [conversations]
  )

  const clientsWithoutChat = clients.filter((c) => !conversationClientIds.has(c.id))

  const startChat = async (clientId: string) => {
    setOpeningClientId(clientId)
    setOpenError('')
    const result = await openCoachChatWithClient(clientId)
    setOpeningClientId(null)
    if ('error' in result) {
      setOpenError(result.error)
      return
    }
    router.push(result.href)
  }

  if (loading || autoOpening) return <CoachShell loading />

  return (
    <CoachShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={styles.title}>{brandTitle('Client Conversations')}</h1>
          <p style={styles.subtitle}>Message any assigned client — you can text first.</p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          style={{
            border: `1px solid ${colors.accent}`,
            background: colors.accent,
            color: colors.textInverse,
            borderRadius: 999,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {pickerOpen ? 'Close' : 'Message a client'}
        </button>
      </div>

      {openError ? (
        <p style={{ margin: '0 0 12px', color: colors.danger, fontSize: 14 }}>{openError}</p>
      ) : null}

      {pickerOpen ? (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            borderRadius: 16,
            border: `1px solid ${colors.borderSubtle}`,
            background: colors.bgCard,
          }}
        >
          <p style={{ margin: '0 0 10px', fontWeight: 600, color: colors.textPrimary }}>
            Start a new chat
          </p>
          {clients.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: colors.textMuted }}>No assigned clients yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {(clientsWithoutChat.length > 0 ? clientsWithoutChat : clients).map((client) => {
                const label = client.name || client.email || 'Client'
                const alreadyOpen = conversationClientIds.has(client.id)
                return (
                  <button
                    key={client.id}
                    type="button"
                    disabled={openingClientId === client.id}
                    onClick={() => void startChat(client.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${colors.borderSubtle}`,
                      background: colors.bgElevated,
                      cursor: 'pointer',
                      color: colors.textPrimary,
                      fontWeight: 600,
                    }}
                  >
                    {openingClientId === client.id
                      ? 'Opening…'
                      : alreadyOpen
                        ? `Open chat · ${label}`
                        : `Message ${label}`}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>
            Conversations could not be loaded
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>{error}</p>
          <button
            type="button"
            onClick={() => {
              if (error.toLowerCase().includes('session')) retry()
              else reload()
            }}
            style={{
              border: `1px solid ${colors.accent}`,
              background: colors.accentMuted,
              color: colors.accent,
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: colors.textPrimary }}>
            No conversations yet
          </p>
          <p style={{ margin: 0, fontSize: 14 }}>
            Tap <strong>Message a client</strong> to text any assigned client first.
          </p>
        </div>
      ) : (
        conversations.map((conv) => {
          const profile = conv.profiles
          const name = profile?.name || profile?.email || 'Client'
          const unread = (conv.unread_by_coach ?? 0) > 0
          return (
            <Link key={conv.id} href={`/coach/chat/${conv.id}`} style={{ textDecoration: 'none' }}>
              <div className="card-hover" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 16,
                marginBottom: 12,
                borderRadius: 16,
                border: `1px solid ${unread ? 'rgba(249,115,22,0.3)' : colors.borderSubtle}`,
                backgroundColor: unread ? colors.accentMuted : colors.bgCard,
                boxShadow: shadows.sm,
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: colors.bgElevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  color: colors.accent,
                }}>
                  {(name[0] ?? 'C').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: colors.textPrimary }}>{name}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{formatRelativeActivity(conv.last_message_at)}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {conv.last_message_preview ?? 'No messages yet'}
                  </p>
                </div>
                {unread && (
                  <span style={{ backgroundColor: colors.accent, color: colors.textInverse, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                    {conv.unread_by_coach}
                  </span>
                )}
              </div>
            </Link>
          )
        })
      )}
    </CoachShell>
  )
}

export default function CoachChatListPage() {
  return (
    <Suspense fallback={<CoachShell loading />}>
      <CoachChatListInner />
    </Suspense>
  )
}
