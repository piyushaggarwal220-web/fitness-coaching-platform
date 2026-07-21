import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatIssueStatus } from '@/lib/issue-reports'
import { sendNotification } from '@/lib/notifications/dispatcher'
import type { IssueStatus } from '@/types/database'

export async function updateIssueStatus(
  supabase: SupabaseClient,
  issueId: string,
  status: IssueStatus,
  adminNotes?: string
): Promise<{ error: string | null }> {
  const now = new Date().toISOString()
  const payload: Record<string, unknown> = { status, updated_at: now }
  if (adminNotes !== undefined) payload.admin_notes = adminNotes
  if (status === 'resolved' || status === 'closed') payload.resolved_at = now

  const { data, error } = await supabase
    .from('issue_reports')
    .update(payload)
    .eq('id', issueId)
    .select('client_id')
    .single()
  if (error) return { error: error.message }

  if (data?.client_id) {
    await sendNotification({
      userId: data.client_id,
      type: 'issue_update',
      title: 'Issue report updated',
      body: `Your report status is now: ${formatIssueStatus(status)}`,
      actionUrl: '/client/report-issue',
      idempotencyKey: `issue-status:${issueId}:${status}`,
    })
  }
  return { error: null }
}
