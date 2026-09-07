/**
 * Single source of truth for AI model pricing and payment fee configuration.
 * Edit this file only when pricing changes.
 */

import { MODELS } from '@/lib/ai/config'

/** USD per 1M tokens — update here when OpenAI list rates change. */
export const AI_PRICING_USD_PER_MILLION = {
  luna: { input: 0.5, output: 3.0, label: 'GPT-5.6 Luna' },
  terra: { input: 2.0, output: 12.0, label: 'GPT-5.6 Terra' },
  astra: { input: 10.0, output: 40.0, label: 'GPT-6 Astra' },
  haiku: { input: 1.0, output: 5.0, label: 'Claude Haiku' },
  sonnet: { input: 3.0, output: 15.0, label: 'Claude Sonnet' },
  opus: { input: 15.0, output: 75.0, label: 'Claude Opus' },
  mock: { input: 0, output: 0, label: 'Mock' },
} as const

export type AiPricingTier = keyof typeof AI_PRICING_USD_PER_MILLION

/** Razorpay domestic card/UPI fee estimate (percentage of transaction amount). */
export const RAZORPAY_FEE_PERCENT = 2.0

/** Used to express AI USD costs alongside INR revenue on profit dashboard. */
export const USD_TO_INR = 83.5

const MODEL_ALIASES: Record<string, AiPricingTier> = {
  [MODELS.GPT_LUNA.toLowerCase()]: 'luna',
  [MODELS.GPT_TERRA.toLowerCase()]: 'terra',
  'gpt-5.6-luna': 'luna',
  'gpt-5.6-terra': 'terra',
  'gpt-6-astra': 'astra',
  'claude-opus-4-6': 'opus',
  'claude-opus-4-20250514': 'opus',
  'mock-plan-v1': 'mock',
}

export function resolveModelPricingTier(model: string | null | undefined): AiPricingTier {
  if (!model) return 'terra'
  const normalized = model.trim().toLowerCase()
  if (MODEL_ALIASES[normalized]) return MODEL_ALIASES[normalized]
  if (normalized.includes('astra')) return 'astra'
  if (normalized.includes('terra')) return 'terra'
  if (normalized.includes('luna')) return 'luna'
  if (normalized.includes('opus')) return 'opus'
  if (normalized.includes('haiku')) return 'haiku'
  if (normalized.includes('mock')) return 'mock'
  if (normalized.includes('sonnet')) return 'sonnet'
  return 'terra'
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export type AiCostBreakdown = {
  inputCostUsd: number
  outputCostUsd: number
  totalCostUsd: number
  tier: AiPricingTier
}

export function calculateAiCostUsd(
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
): AiCostBreakdown {
  const tier = resolveModelPricingTier(model)
  const rates = AI_PRICING_USD_PER_MILLION[tier]
  const input = Math.max(0, inputTokens ?? 0)
  const output = Math.max(0, outputTokens ?? 0)
  const inputCostUsd = roundUsd((input / 1_000_000) * rates.input)
  const outputCostUsd = roundUsd((output / 1_000_000) * rates.output)
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
    tier,
  }
}

export function calculateRazorpayFeeInr(amountPaise: number): number {
  return Math.round((amountPaise / 100) * (RAZORPAY_FEE_PERCENT / 100) * 100) / 100
}

export function usdToInr(usd: number): number {
  return Math.round(usd * USD_TO_INR * 100) / 100
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount)
}
