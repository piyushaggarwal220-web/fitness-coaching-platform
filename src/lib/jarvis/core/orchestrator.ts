import { createAdminClient } from '@/lib/supabase/admin'
import { generateMarketingJson } from '@/lib/ai-marketing/openai/marketing-openai'
import { generateOpenAIResponse } from '@/lib/ai/openai'
import { MODELS } from '@/lib/ai/config'
import { buildJarvisContext } from '@/lib/jarvis/core/context'
import {
  JARVIS_PLAN_JSON_CONTRACT,
  jarvisPlanSchema,
  normalizeJarvisPlanOutput,
} from '@/lib/jarvis/core/plan'
import { runTool } from '@/lib/jarvis/core/action-runner'
import { ensureJarvisToolsRegistered } from '@/lib/jarvis/tools/builtins'
import { getJarvisBudgets } from '@/lib/jarvis/cost/governor'
import {
  assertAiBudgetAvailable,
  getCostDashboard,
  recordCostUsage,
} from '@/lib/jarvis/cost/usage'
import {
  investigationSystemGuardrails,
  separateCommerceSystemsNote,
} from '@/lib/jarvis/reasoning/boundaries'
import {
  detectOperatorReplyMode,
  operatorComposeSystemPrompt,
  presentOperatorReply,
} from '@/lib/jarvis/reasoning/operator-reply'
import {
  buildDurablePlanFromToolCalls,
  persistTaskPlan,
  updatePlanStep,
} from '@/lib/jarvis/core/durable-plan'
import { learnFromChatTurn } from '@/lib/jarvis/memory/learning-loop'
import type { JarvisStreamEvent } from '@/lib/jarvis/types'

export async function getOrCreateConversation(input: {
  conversationId?: string | null
  actorId: string
  title?: string
}): Promise<string> {
  const admin = createAdminClient()
  if (input.conversationId) {
    const { data } = await admin
      .from('jarvis_conversations')
      .select('id')
      .eq('id', input.conversationId)
      .maybeSingle()
    if (data?.id) return data.id
  }
  const { data, error } = await admin
    .from('jarvis_conversations')
    .insert({
      title: input.title || 'Jarvis session',
      created_by: input.actorId,
    })
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error(error?.message || 'Failed to create conversation')
  return data.id
}

/**
 * Main Jarvis chat turn — OBSERVE → THINK → tools → ACT/ASK → LEARN.
 * Emits SSE-friendly events via onEvent callback (streaming UX).
 */
export async function runJarvisTurn(input: {
  message: string
  conversationId?: string | null
  actorId: string
  onEvent?: (ev: JarvisStreamEvent) => void
}): Promise<{
  conversationId: string
  taskId: string
  assistantMessage: string
  approvals: unknown[]
}> {
  ensureJarvisToolsRegistered()
  const emit = input.onEvent ?? (() => undefined)
  const admin = createAdminClient()
  const budgets = await getJarvisBudgets()

  if (!budgets.background_enabled) {
    throw new Error('Jarvis is paused. Chat, background work, and actions are off.')
  }

  const gate = await assertAiBudgetAvailable(0.05)
  if (!gate.ok) {
    emit({ type: 'error', error: gate.reason })
    emit({
      type: 'cost',
      spent_usd: gate.dailySpent,
      daily_spent_usd: gate.dailySpent,
      daily_limit_usd: gate.dailyLimit,
    })
    throw new Error(gate.reason)
  }

  emit({ type: 'status', message: 'Loading business context…' })
  const conversationId = await getOrCreateConversation({
    conversationId: input.conversationId,
    actorId: input.actorId,
    title: input.message.slice(0, 60),
  })

  await admin.from('jarvis_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: input.message,
  })

  const { data: task } = await admin
    .from('jarvis_tasks')
    .insert({
      conversation_id: conversationId,
      objective: input.message.slice(0, 500),
      status: 'running',
      source: 'chat',
      budget_usd: budgets.per_chat_budget_usd,
      max_tokens: budgets.max_tokens_per_task,
      max_tool_calls: budgets.max_tool_calls_per_task,
      created_by: input.actorId,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  const taskId = task?.id as string
  let spentUsd = 0
  let tokensUsed = 0
  const approvals: unknown[] = []
  const toolResults: { tool: string; status: string; summary: string; output?: unknown }[] = []

  try {
    const ctx = await buildJarvisContext(conversationId, { objective: input.message })

    const complex =
      /\b(why|fix|investigate|plan|research|compare|prepare|across|sales down|cpa)\b/i.test(
        input.message
      )
    if (complex) {
      emit({
        type: 'status',
        message: 'Give me a moment — checking the relevant business systems together…',
      })
    } else {
      emit({ type: 'status', message: 'Thinking…' })
    }

    const plan = await generateMarketingJson({
      systemPrompt: `You are JARVIS, the LURVOX AI Business Operator — not a chatbot that only talks.
Operating loop: OBSERVE → THINK → DECIDE → ACT → ASK WHEN NECESSARY → LEARN.

Choose registered tools when data/actions are needed. Do not invent numbers.
Prefer analytics.investigate (with pattern_id when matching) for cross-system "why" questions instead of blindly calling every tool.
For "how is the business doing" prefer lurvox.revenue + funnels.performance or analytics.investigate pattern business_health.
Never interpret "do whatever you think is necessary" as bypassing SIGNIFICANT approval gates.
When reporting external writes, distinguish PLANNED / REQUESTED / EXECUTED / VERIFIED / FAILED / BLOCKED / WAITING_FOR_APPROVAL using tool verification summaries.
Use memory only as context — never as the source of truth for live metrics.
If memory_conflicts are present, tell the user which record you are using and why.
If the user asks why a metric, tool, recommendation, or integration is wrong/missing, call system.why or system.diagnose. Investigate the pipeline; do not answer from memory.
Never report revenue/orders/spend as 0 when data_status is failed, unavailable, or unknown.
Business revenue questions ("how has my business been doing", "revenue today/yesterday", "last N days") MUST use lurvox.revenue (public.purchases, Asia/Kolkata).
shopify.today_revenue is Shopify store commerce only — use it only when the user asks about the Shopify store/orders.
Never recommend reconciling LURVOX Razorpay (public.purchases) against Shopify orders unless evidence shows an explicit verified relationship.
Meta tools are ads only (spend, attributed purchases, CPA, ROAS) — never LURVOX cash revenue.
If Meta performance is unavailable / lastSyncAt is null, call system.diagnose or meta.status / investigate Meta sync before unrelated Shopify reporting.
Never infer funnel_id from purchase amount or plan price — funnel identity comes from configured mapping only.
If a metric is not in the source-of-truth catalog, say Source of truth not verified.
Distinguish facts, observations, hypotheses, and recommendations in your thinking_summary.
Answer in short everyday language. If you need permission, say what you want to do, why, and the risk in one line each — then point to Approvals.
Follow-ups refer to prior history.structured tool_results — do not restart cold.
${investigationSystemGuardrails()}
${separateCommerceSystemsNote()}
For SIGNIFICANT writes, still request the tool — the permission engine creates the approval card. When you mention that ask in chat, use one plain sentence (what, why, risk). No tool ids, policy codes, or essays.
If the user only wants explanation and context already has enough, set tool_calls=[].
Never call forbidden self-permission/budget tools.
Keep thinking_summary concise (evidence-oriented, not hidden chain-of-thought dump).

${JARVIS_PLAN_JSON_CONTRACT}`,
      userPrompt: JSON.stringify({
        user_message: input.message,
        context: {
          ...ctx,
          history: ctx.history.slice(-12),
        },
      }),
      schema: jarvisPlanSchema,
      normalize: normalizeJarvisPlanOutput,
      maxTokens: 2500,
      model: MODELS.GPT_LUNA,
    })

    spentUsd += await recordCostUsage({
      category: 'chat',
      conversationId,
      taskId,
      model: plan.model,
      tokensIn: 2000,
      tokensOut: 800,
      metadata: { phase: 'plan' },
    })
    tokensUsed += 2800

    if (plan.data.needs_clarification && plan.data.clarification_question) {
      const content = plan.data.clarification_question
      const { data: msg } = await admin
        .from('jarvis_messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content,
          cost_usd: spentUsd,
          model: plan.model,
        })
        .select('id, content')
        .maybeSingle()

      emit({ type: 'token', text: content })
      emit({
        type: 'message',
        message: { id: msg?.id || '', content },
      })
      await finishTask(admin, taskId, 'completed', spentUsd, tokensUsed)
      const cost = await getCostDashboard()
      emit({
        type: 'cost',
        spent_usd: spentUsd,
        daily_spent_usd: cost.daily_spent_usd,
        daily_limit_usd: cost.daily_limit_usd,
      })
      emit({ type: 'done', conversationId, taskId })
      return { conversationId, taskId, assistantMessage: content, approvals }
    }

    const calls = plan.data.tool_calls.slice(0, budgets.max_tool_calls_per_task)
    const durable = buildDurablePlanFromToolCalls({
      objective: input.message,
      thinkingSummary: plan.data.thinking_summary,
      toolCalls: calls,
      estimatedCostUsd: spentUsd,
    })
    await persistTaskPlan(taskId, durable)

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const stepId = `step_${i + 1}`
      if (spentUsd >= budgets.per_chat_budget_usd) {
        emit({
          type: 'status',
          message: 'Per-chat budget reached — stopping further tools.',
        })
        await updatePlanStep(taskId, stepId, {
          status: 'skipped',
          error: 'per_chat_budget',
          planStatus: 'paused_budget',
        })
        break
      }
      if (tokensUsed >= budgets.max_tokens_per_task) {
        emit({ type: 'status', message: 'Token limit reached — stopping.' })
        await updatePlanStep(taskId, stepId, {
          status: 'skipped',
          error: 'token_limit',
          planStatus: 'paused_budget',
        })
        break
      }

      const daily = await assertAiBudgetAvailable(0.05)
      if (!daily.ok) {
        emit({ type: 'error', error: daily.reason })
        await updatePlanStep(taskId, stepId, {
          status: 'skipped',
          error: daily.reason,
          planStatus: 'paused_budget',
        })
        break
      }

      await updatePlanStep(taskId, stepId, {
        status: 'running',
        started_at: new Date().toISOString(),
        planStatus: 'running',
      })

      emit({
        type: 'tool_start',
        tool: call.tool,
        risk: 'READ',
        input: call.input,
      })

      const result = await runTool(call.tool, call.input, {
        actorId: input.actorId,
        conversationId,
        taskId,
        source: 'chat',
      })

      spentUsd += result.costUsd
      toolResults.push({
        tool: call.tool,
        status: result.status,
        summary: result.summary,
        output: result.status === 'executed' ? result.output : undefined,
      })

      emit({
        type: 'tool_result',
        tool: call.tool,
        ok: result.status === 'executed' || result.status === 'requires_approval',
        summary: result.summary,
        risk: result.riskClass as 'READ',
      })

      if (result.approval) {
        approvals.push(result.approval)
        emit({ type: 'approval', approval: result.approval })
        await updatePlanStep(taskId, stepId, {
          status: 'waiting_for_approval',
          result_summary: result.summary,
          risk: result.riskClass as 'READ' | 'LOW_RISK' | 'SIGNIFICANT' | 'DANGEROUS',
          planStatus: 'waiting_for_approval',
          completed_at: new Date().toISOString(),
        })
      } else if (result.status === 'executed') {
        await updatePlanStep(taskId, stepId, {
          status: 'completed',
          result_summary: result.summary,
          risk: result.riskClass as 'READ' | 'LOW_RISK' | 'SIGNIFICANT' | 'DANGEROUS',
          completed_at: new Date().toISOString(),
        })
      } else {
        await updatePlanStep(taskId, stepId, {
          status: 'failed',
          error: result.error || result.summary,
          result_summary: result.summary,
          risk: result.riskClass as 'READ' | 'LOW_RISK' | 'SIGNIFICANT' | 'DANGEROUS',
          planStatus: result.status === 'budget_exhausted' ? 'paused_budget' : 'failed',
          completed_at: new Date().toISOString(),
        })
        // Preserve prior successes — do not blindly retry the failed step
      }

      await admin
        .from('jarvis_tasks')
        .update({
          tool_calls_used: toolResults.length,
          spent_usd: spentUsd,
          tokens_used: tokensUsed,
        })
        .eq('id', taskId)
    }

    emit({ type: 'status', message: 'Composing response…' })
    const replyMode = detectOperatorReplyMode(input.message, {
      hasApprovals: approvals.length > 0,
    })
    const final = await generateOpenAIResponse({
      systemPrompt: operatorComposeSystemPrompt(replyMode),
      userPrompt: JSON.stringify({
        user_message: input.message,
        thinking_summary: plan.data.thinking_summary,
        tool_results: toolResults.map((t) => ({
          tool: t.tool,
          status: t.status,
          summary: t.summary,
          // Full outputs stay available for the model; final prose is compressed after.
          output: t.output,
        })),
        approvals,
        presentation: {
          mode: replyMode,
          word_target: '100-250',
          hard_cap: replyMode === 'detailed' ? null : 300,
          progressive_disclosure:
            'Put deep diagnostic detail in structured tool_results only — not in the owner-facing prose.',
        },
        funnel_reminder: '₹99 and ₹1,699 are independent economics — do not infer funnel from price',
        commerce_systems: separateCommerceSystemsNote(),
      }),
      model: MODELS.GPT_LUNA,
      maxTokens: replyMode === 'detailed' ? 2500 : 900,
    })

    const presented = presentOperatorReply({
      userMessage: input.message,
      draft: final.text,
      hasApprovals: approvals.length > 0,
    })
    const finalText = presented.text

    spentUsd += await recordCostUsage({
      category: 'chat',
      conversationId,
      taskId,
      model: final.model,
      tokensIn: final.inputTokens,
      tokensOut: final.outputTokens,
      metadata: { phase: 'reply' },
    })
    tokensUsed += final.inputTokens + final.outputTokens

    // Progressive token events for UI streaming feel
    const chunks = chunkText(finalText, 48)
    for (const c of chunks) {
      emit({ type: 'token', text: c })
    }

    const approvalIds = approvals.map((a) => (a as { id: string }).id)
    const { data: msg } = await admin
      .from('jarvis_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: finalText,
        structured: {
          thinking_summary: plan.data.thinking_summary,
          tool_results: toolResults,
          presentation: {
            mode: presented.mode,
            compressed: presented.compressed,
            word_count: presented.word_count,
          },
        },
        approval_ids: approvalIds,
        cost_usd: spentUsd,
        tokens_in: tokensUsed,
        tokens_out: final.outputTokens,
        model: final.model,
      })
      .select('id')
      .maybeSingle()

    emit({
      type: 'message',
      message: {
        id: msg?.id || '',
        content: finalText,
        approval_ids: approvalIds,
        cost_usd: spentUsd,
      },
    })

    const awaiting = approvals.length > 0
    await finishTask(
      admin,
      taskId,
      awaiting ? 'awaiting_approval' : 'completed',
      spentUsd,
      tokensUsed,
      { toolResults, approvals }
    )

    // LEARN: durable outcome + optional explicit preference; activity notification
    if (toolResults.some((t) => t.status === 'executed' || t.status === 'requires_approval')) {
      await learnFromChatTurn({
        userMessage: input.message,
        thinkingSummary: plan.data.thinking_summary,
        toolResults,
        approvals,
        taskId,
        conversationId,
        actorId: input.actorId,
      }).catch(() => undefined)

      await admin.from('jarvis_notifications').insert({
        kind: 'activity',
        title: 'Jarvis acted',
        body: plan.data.thinking_summary.slice(0, 240),
        link: '/admin/jarvis',
        metadata: { task_id: taskId, conversation_id: conversationId },
      })
    }

    const cost = await getCostDashboard()
    emit({
      type: 'cost',
      spent_usd: spentUsd,
      daily_spent_usd: cost.daily_spent_usd,
      daily_limit_usd: cost.daily_limit_usd,
    })
    emit({ type: 'done', conversationId, taskId })

    await admin
      .from('jarvis_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)

    return {
      conversationId,
      taskId,
      assistantMessage: finalText,
      approvals,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Jarvis turn failed'
    if (taskId) {
      await admin
        .from('jarvis_tasks')
        .update({
          status: message.includes('budget') ? 'budget_exhausted' : 'failed',
          error: message,
          spent_usd: spentUsd,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
    }
    emit({ type: 'error', error: message })
    throw err
  }
}

async function finishTask(
  admin: ReturnType<typeof createAdminClient>,
  taskId: string,
  status: string,
  spentUsd: number,
  tokensUsed: number,
  result?: unknown
) {
  await admin
    .from('jarvis_tasks')
    .update({
      status,
      spent_usd: spentUsd,
      tokens_used: tokensUsed,
      result: result ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)
}

function chunkText(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out.length ? out : ['']
}
