import type { SupabaseClient } from '@supabase/supabase-js'
import type { IssueCategory, IssueReport, IssueStatus } from '@/types/database'

export const ISSUE_CATEGORIES: { value: IssueCategory; label: string }[] = [
  { value: 'bug', label: 'Bug / Technical Issue' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'account', label: 'Account Issue' },
  { value: 'billing', label: 'Billing / Payment' },
  { value: 'other', label: 'Other' },
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

export type CreateIssueInput = {
  clientId: string
  category?: IssueCategory | null
  description: string
  screenshotUrl?: string | null
  systemInfo?: Record<string, unknown> | null
}

export async function createIssueReport(
  supabase: SupabaseClient,
  input: CreateIssueInput
): Promise<{ data: IssueReport | null; error: string | null }> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('issue_reports')
    .insert({
      client_id: input.clientId,
      category: input.category ?? null,
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
