import * as XLSX from 'xlsx'
import { calculateAiCostUsd, calculateRazorpayFeeInr } from '@/lib/admin/pricing'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiGenerationLog, Purchase } from '@/types/database'

export type ExportType = 'purchases' | 'revenue' | 'ai-costs' | 'customers'

function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(','))
  }
  return lines.join('\n')
}

export async function buildExportDataset(type: ExportType): Promise<{
  filename: string
  headers: string[]
  rows: (string | number | null | undefined)[][]
}> {
  const admin = createAdminClient()

  if (type === 'purchases' || type === 'revenue') {
    const { data } = await admin
      .from('purchases')
      .select('*, profiles:user_id(name, email)')
      .order('created_at', { ascending: false })

    const purchases = (data ?? []) as (Purchase & {
      profiles?: { name: string | null; email: string | null } | null
    })[]

    const headers = [
      'Purchase Date',
      'Customer',
      'Email',
      'Product',
      'Amount (INR)',
      'Status',
      'Razorpay Order ID',
      'Razorpay Payment ID',
      'Fee (INR)',
    ]

    const rows = purchases.map((p) => [
      p.created_at,
      p.profiles?.name || p.customer_name || '—',
      p.profiles?.email || p.customer_email,
      p.plan_name,
      p.amount_paise / 100,
      p.status,
      p.razorpay_order_id,
      p.razorpay_payment_id,
      calculateRazorpayFeeInr(p.amount_paise),
    ])

    return { filename: type === 'revenue' ? 'revenue-export' : 'purchases-export', headers, rows }
  }

  if (type === 'ai-costs') {
    const { data } = await admin
      .from('ai_generation_logs')
      .select(
        'created_at, action, model, prompt_tokens, completion_tokens, total_cost_usd, input_cost_usd, output_cost_usd, success, client_id'
      )
      .order('created_at', { ascending: false })
      .limit(5000)

    const logs = (data ?? []) as AiGenerationLog[]
    const headers = [
      'Date',
      'Action',
      'Model',
      'Prompt Tokens',
      'Completion Tokens',
      'Input Cost (USD)',
      'Output Cost (USD)',
      'Total Cost (USD)',
      'Success',
      'Client ID',
    ]

    const rows = logs.map((log) => {
      const cost = calculateAiCostUsd(log.model, log.prompt_tokens, log.completion_tokens)
      const storedTotal = log.total_cost_usd != null ? Number(log.total_cost_usd) : cost.totalCostUsd
      const storedInput = log.input_cost_usd != null ? Number(log.input_cost_usd) : cost.inputCostUsd
      const storedOutput = log.output_cost_usd != null ? Number(log.output_cost_usd) : cost.outputCostUsd

      return [
        log.created_at,
        log.action,
        log.model,
        log.prompt_tokens,
        log.completion_tokens,
        storedInput,
        storedOutput,
        storedTotal,
        log.success ? 'yes' : 'no',
        log.client_id,
      ]
    })

    return { filename: 'ai-costs-export', headers, rows }
  }

  const { data } = await admin
    .from('profiles')
    .select('id, name, email, coach_id, payment_confirmed, onboarding_complete, plan_delivered, updated_at')
    .eq('role', 'client')
    .order('updated_at', { ascending: false })

  const clients = data ?? []
  const headers = [
    'Client ID',
    'Name',
    'Email',
    'Payment Confirmed',
    'Onboarding Complete',
    'Plan Delivered',
    'Coach ID',
    'Updated At',
  ]

  const rows = clients.map((c) => [
    c.id,
    c.name,
    c.email,
    c.payment_confirmed ? 'yes' : 'no',
    c.onboarding_complete ? 'yes' : 'no',
    c.plan_delivered ? 'yes' : 'no',
    c.coach_id,
    c.updated_at,
  ])

  return { filename: 'customers-export', headers, rows }
}

export function exportToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return toCsv(headers, rows)
}

export function exportToXlsx(headers: string[], rows: (string | number | null | undefined)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Export')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
