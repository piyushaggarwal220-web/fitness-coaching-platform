import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  IssueCategory,
  IssueReport,
  IssueStatus,
  IssueTopic,
  SupportRequestCategory,
} from '@/types/database'

export const ISSUE_CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: 'plan_review', label: 'Review of my plan' },
  { value: 'plan_complaint', label: 'Complaint about my plan' },
  { value: 'platform_review', label: 'Review of the app' },
  { value: 'bug', label: 'Bug / something broken' },
  { value: 'feature', label: 'Feature request' },
  { value: 'account', label: 'Account issue' },
  { value: 'billing', label: 'Billing / payment' },
  { value: 'other', label: 'Other' },
]

export const ISSUE_TOPICS: { value: IssueTopic; label: string }[] = [
  { value: 'plan', label: 'My coaching plan' },
  { value: 'tracker', label: 'Daily tracker' },
  { value: 'platform', label: 'App / website' },
]

export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

export function formatIssueStatus(status: IssueStatus): string {
  return ISSUE_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function formatIssueCategory(category: IssueCategory | null): string {
  if (!category) return 'Uncategorized'
  return ISSUE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function formatIssueTopic(topic: IssueTopic | null | undefined): string {
  if (!topic) return ''
  return ISSUE_TOPICS.find((t) => t.value === topic)?.label ?? topic
}

export function supportCategoryForIssue(category: IssueCategory | null): SupportRequestCategory | null {
  if (category === 'plan_complaint') return 'plan_complaint'
  if (category === 'plan_review') return 'plan_review'
  if (category === 'platform_review') return 'platform_feedback'
  return null
}

export type CreateIssueInput = {
  clientId: string
  category?: IssueCategory | null
  topic?: IssueTopic | null
  rating?: number | null
  description: string
  screenshotUrl?: string | null
  systemInfo?: Record<string, unknown> | null
}

export async function createIssueReport(
  supabase: SupabaseClient,
  input: CreateIssueInput
): Promise<{ data: IssueReport | null; error: string | null }> {
  const now = new Date().toISOString()
  const rating =
    typeof input.rating === 'number' && input.rating >= 1 && input.rating <= 5
      ? input.rating
      : null

  const { data, error } = await supabase
    .from('issue_reports')
    .insert({
      client_id: input.clientId,
      category: input.category ?? null,
      topic: input.topic ?? null,
      rating,
      description: input.description.trim(),
      screenshot_url: input.screenshotUrl ?? null,
      system_info: input.systemInfo ?? null,
      status: 'open',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to submit report.' }
  return { data: data as IssueReport, error: null }
}

export function collectSystemInfo(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    platform: navigator.platform,
    timestamp: new Date().toISOString(),
  }
}
