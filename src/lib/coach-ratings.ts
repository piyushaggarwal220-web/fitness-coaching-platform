import type { SupabaseClient } from '@supabase/supabase-js'
import type { CoachRatingValue, CoachReplyRating } from '@/types/database'

export const RATING_OPTIONS: { value: CoachRatingValue; label: string; emoji: string }[] = [
  { value: 'very_helpful', label: 'Very Helpful', emoji: '🌟' },
  { value: 'helpful', label: 'Helpful', emoji: '👍' },
  { value: 'needs_improvement', label: 'Needs Improvement', emoji: '💡' },
]

export function formatRatingValue(rating: CoachRatingValue): string {
  return RATING_OPTIONS.find((r) => r.value === rating)?.label ?? rating
}

export async function submitCoachRating(
  supabase: SupabaseClient,
  input: {
    messageId: string
    clientId: string
    coachId: string
    rating: CoachRatingValue
    comment?: string
  }
): Promise<{ data: CoachReplyRating | null; error: string | null }> {
  const { data, error } = await supabase
    .from('coach_reply_ratings')
    .insert({
      message_id: input.messageId,
      client_id: input.clientId,
      coach_id: input.coachId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    if (error.message.includes('duplicate')) {
      return { data: null, error: 'You have already rated this reply.' }
    }
    return { data: null, error: error.message }
  }

  return { data: data as CoachReplyRating, error: null }
}

export async function getRatingForMessage(
  supabase: SupabaseClient,
  messageId: string,
  clientId: string
): Promise<CoachReplyRating | null> {
  const { data } = await supabase
    .from('coach_reply_ratings')
    .select('*')
    .eq('message_id', messageId)
    .eq('client_id', clientId)
    .maybeSingle()

  return (data as CoachReplyRating) ?? null
}

export async function getCoachRatingStats(
  supabase: SupabaseClient,
  coachId: string
): Promise<{ veryHelpful: number; helpful: number; needsImprovement: number; total: number }> {
  const { data } = await supabase
    .from('coach_reply_ratings')
    .select('rating')
    .eq('coach_id', coachId)

  const ratings = data ?? []
  return {
    veryHelpful: ratings.filter((r) => r.rating === 'very_helpful').length,
    helpful: ratings.filter((r) => r.rating === 'helpful').length,
    needsImprovement: ratings.filter((r) => r.rating === 'needs_improvement').length,
    total: ratings.length,
  }
}
