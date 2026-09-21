import { NextResponse } from 'next/server'
import { requireMarketingAdmin } from '@/lib/ai-marketing/auth'
import { runJarvisTurn } from '@/lib/jarvis/core/orchestrator'
import type { JarvisStreamEvent } from '@/lib/jarvis/types'
import { humanizeJarvisError } from '@/lib/jarvis/operator-errors'
import { humanToolLabel, workingStatusForTool } from '@/lib/jarvis/operator-present'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sanitizeStreamEvent(ev: JarvisStreamEvent): JarvisStreamEvent {
  if (ev.type === 'tool_start') {
    return {
      type: 'tool_start',
      tool: humanToolLabel(ev.tool),
      risk: ev.risk,
    }
  }
  if (ev.type === 'tool_result') {
    return {
      type: 'tool_result',
      tool: humanToolLabel(ev.tool),
      ok: ev.ok,
      summary: ev.summary.slice(0, 240),
      risk: ev.risk,
    }
  }
  if (ev.type === 'status') {
    const mapped =
      ev.message === 'Loading business context…'
        ? 'Checking business context...'
        : ev.message === 'Thinking…'
          ? 'Understanding request...'
          : ev.message === 'Composing response…'
            ? 'Preparing recommendation...'
            : ev.message
    return { type: 'status', message: mapped }
  }
  if (ev.type === 'error') {
    return { type: 'error', error: humanizeJarvisError(ev.error) }
  }
  if (ev.type === 'approval') {
    const { approval } = ev
    return {
      type: 'approval',
      approval: {
        ...approval,
        current_state: approval.current_state ?? {},
        proposed_state: approval.proposed_state ?? {},
        evidence: (approval.evidence ?? []).slice(0, 8),
      },
    }
  }
  return ev
}

/** Streaming chat turn (SSE). */
export async function POST(request: Request) {
  const auth = await requireMarketingAdmin()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    message?: string
    conversationId?: string
    stream?: boolean
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ success: false, error: 'message required' }, { status: 400 })
  }

  const useStream = body.stream !== false

  if (!useStream) {
    try {
      const result = await runJarvisTurn({
        message: body.message.trim(),
        conversationId: body.conversationId,
        actorId: auth.user.id,
      })
      return NextResponse.json({ success: true, ...result })
    } catch (error) {
      return NextResponse.json(
        { success: false, error: humanizeJarvisError(error) },
        { status: 500 }
      )
    }
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: JarvisStreamEvent) => {
        if (ev.type === 'tool_start') {
          const statusEv: JarvisStreamEvent = {
            type: 'status',
            message: workingStatusForTool(ev.tool),
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEv)}\n\n`))
        }
        const safe = sanitizeStreamEvent(ev)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(safe)}\n\n`))
      }
      try {
        await runJarvisTurn({
          message: body.message!.trim(),
          conversationId: body.conversationId,
          actorId: auth.user.id,
          onEvent: send,
        })
      } catch (error) {
        send({
          type: 'error',
          error: humanizeJarvisError(error),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
