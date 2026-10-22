'use client'

import { useEffect, useState } from 'react'
import { clientChatNavLabel } from '@/lib/coach-routing'
import { clientHasCoachChat } from '@/lib/coach-service'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export function useClientChatAccess(): { hasChat: boolean; label: string } {
  const [hasChat, setHasChat] = useState(true)
  const [label, setLabel] = useState('Smart Coach')

  useEffect(() => {
    let active = true
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('coach_id, coach_service')
        .eq('id', user.id)
        .maybeSingle()
      if (!active || !data) return
      setHasChat(clientHasCoachChat(data))
      setLabel(clientChatNavLabel(data))
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  return { hasChat, label }
}

export function useClientChatLabel(): string {
  return useClientChatAccess().label
}
