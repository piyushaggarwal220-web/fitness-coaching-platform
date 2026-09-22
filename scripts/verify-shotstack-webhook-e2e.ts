/**
 * End-to-end Shotstack webhook verification.
 * Uses public sample footage only — never real gym uploads.
 * Does not print secrets.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-shotstack-webhook-e2e.ts
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { createAdminClient } from '../src/lib/supabase/admin'
import { buildShortFormFitnessReelPlan } from '../src/lib/jarvis/video/presets'
import { ShotstackVideoEditProvider } from '../src/lib/jarvis/video/shotstack/provider'
import {
  buildShotstackCallbackUrl,
  probeJarvisVideoWebhook,
  shotstackGetRender,
} from '../src/lib/jarvis/video/shotstack/client'
import { buildShotstackEdit } from '../src/lib/jarvis/video/shotstack/edit-builder'
import {
  handleShotstackWebhookPayload,
  listRecentVideoJobs,
} from '../src/lib/ai-marketing/workflows/video-jobs'
import { JARVIS_VIDEO_BUCKET } from '../src/lib/jarvis/video/sources'

const SAMPLE =
  'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForShotstackDone(renderId: string, maxMs = 180_000) {
  const started = Date.now()
  let last = 'queued'
  while (Date.now() - started < maxMs) {
    const st = await shotstackGetRender(renderId)
    last = st.data?.response?.status || last
    if (last === 'done' || last === 'failed') {
      return {
        status: last,
        url: st.data?.response?.url || null,
        error: st.data?.response?.error || null,
      }
    }
    await sleep(8000)
  }
  return { status: last, url: null, error: 'timeout waiting for Shotstack' }
}

async function main() {
  const report: Record<string, unknown> = {
    webhook_reachable: 'NO',
    webhook_authentication: 'FAIL',
    shotstack_render: 'FAIL',
    callback_processing: 'FAIL',
    provider_reverification: 'FAIL',
    idempotency: 'FAIL',
    private_result_archival: 'FAIL',
    command_center_result: 'FAIL',
    render_id: null as string | null,
    job_id: null as string | null,
    blocker: null as string | null,
    lifecycle: [] as string[],
  }

  // 1) Probe public webhook
  const probe = await probeJarvisVideoWebhook()
  report.webhook_probe = {
    configured_url_host: probe.configured_url_host,
    effective_url_host: probe.effective_url_host,
    http_unauth: probe.http_status_unauthenticated,
    http_bad: probe.http_status_bad_token,
    http_good: probe.http_status_good_token,
    diagnosis: probe.diagnosis,
  }

  if (probe.reachable) {
    report.webhook_reachable = 'YES'
    const authOk =
      probe.auth_rejects_unauthenticated === true &&
      probe.auth_rejects_bad_token === true &&
      probe.auth_accepts_good_token === true
    report.webhook_authentication = authOk ? 'PASS' : 'FAIL'
  } else {
    report.webhook_reachable = 'NO'
    report.webhook_authentication = 'FAIL'
    report.blocker = probe.diagnosis
  }

  // 2) Create deterministic job row
  const admin = createAdminClient()
  const jobId = randomUUID()
  report.job_id = jobId

  const callback = buildShotstackCallbackUrl(jobId)
  assert.ok(callback, 'callback URL required')
  // Never log full callback (contains token)
  const callbackSafe = (() => {
    try {
      const u = new URL(callback!)
      u.searchParams.set('token', '[REDACTED]')
      return u.toString()
    } catch {
      return '[callback]'
    }
  })()
  report.callback_url_redacted = callbackSafe

  const { error: insertErr } = await admin.from('video_edit_jobs').insert({
    id: jobId,
    source_video: 'e2e-sample://beach-overhead',
    source_ref: null,
    status: 'queued',
    edit_instructions: { e2e: true, sample: true },
    provider: 'shotstack',
    approval_status: 'pending',
    preset: 'short_form_fitness_reel',
    aspect_ratio: '9:16',
    duration_target_sec: 7,
    estimated_cost_usd: 0.05,
    metadata: { e2e_webhook_test: true, published: false },
  })
  if (insertErr) throw new Error(insertErr.message)
  report.lifecycle = ['queued']

  // 3) Submit tiny Shotstack render WITH callback (via provider edit builder)
  const provider = new ShotstackVideoEditProvider()
  assert.equal(provider.configured, true)
  assert.equal(provider.name, 'shotstack')

  const plan = buildShortFormFitnessReelPlan({
    duration_target_sec: 7,
    hooks: ['E2E'],
    clips: [{ start_sec: 0, end_sec: 7, purpose: 'e2e' }],
  })
  // Use provider.render path semantics: build edit with callback then create
  const edit = buildShotstackEdit({
    sourceUrl: SAMPLE,
    plan,
    sourceDurationSec: 30,
    callbackUrl: callback,
    captionLines: ['E2E'],
  })
  assert.ok(edit.callback, 'edit must include callback')
  assert.equal(edit.output.size.width, 1080)
  assert.equal(edit.output.size.height, 1920)

  const rendered = await provider.render({
    jobId,
    sourceVideo: SAMPLE,
    plan,
  })
  // provider.render rebuilds callback via buildShotstackCallbackUrl(jobId)
  if (rendered.status === 'failed' || !rendered.provider_job_id) {
    report.shotstack_render = 'FAIL'
    report.blocker = rendered.error || 'render failed'
    console.log(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  const renderId = rendered.provider_job_id
  report.render_id = renderId
  report.shotstack_render = 'PASS'
  report.lifecycle = [...(report.lifecycle as string[]), 'rendering']

  await admin
    .from('video_edit_jobs')
    .update({
      status: 'rendering',
      provider_job_id: renderId,
      analysis: rendered.analysis ?? {},
      edit_plan: rendered.edit_plan ?? {},
      crop_strategy: 'center_crop',
    })
    .eq('id', jobId)

  // 4) Wait for Shotstack done (public callback may 404 — we still process via handler)
  const done = await waitForShotstackDone(renderId)
  if (done.status !== 'done' || !done.url) {
    report.blocker = `Shotstack ended as ${done.status}: ${done.error || 'no url'}`
    console.log(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  // 5) Provider re-verification: craft a LYING payload (fake url) — handler must ignore it
  //    and use Shotstack API truth
  const lying = await handleShotstackWebhookPayload({
    type: 'edit',
    action: 'render',
    id: renderId,
    status: 'done',
    url: 'https://evil.example/fake-success.mp4',
    jarvis_job_id: jobId,
  })
  assert.equal(lying.ok, true)
  report.provider_reverification = 'PASS'
  report.callback_processing = lying.ok ? 'PASS' : 'FAIL'

  const { data: afterFirst } = await admin
    .from('video_edit_jobs')
    .select('status, output_video, provider_job_id, metadata, completed_at')
    .eq('id', jobId)
    .maybeSingle()

  assert.ok(afterFirst)
  assert.notEqual(afterFirst.output_video, 'https://evil.example/fake-success.mp4')
  assert.ok(
    afterFirst.status === 'awaiting_approval' || afterFirst.status === 'completed',
    `unexpected status ${afterFirst.status}`
  )
  report.lifecycle = [...(report.lifecycle as string[]), 'completed']

  // 6) Private archival
  const out = String(afterFirst.output_video || '')
  const archivedPrivate = out.startsWith('jarvis-video-result://')
  if (archivedPrivate) {
    report.private_result_archival = 'PASS'
    const storagePath = `results/${jobId}/${renderId}.mp4`
    const { data: listed } = await admin.storage.from(JARVIS_VIDEO_BUCKET).list(`results/${jobId}`, {
      limit: 10,
    })
    const files = (listed || []).map((f) => f.name)
    assert.ok(files.includes(`${renderId}.mp4`), `missing archive file ${storagePath}`)
  } else {
    // Archive may have failed (expired URL timing) — still fail the check honestly
    report.private_result_archival = 'FAIL'
    report.blocker =
      (report.blocker ? report.blocker + ' | ' : '') +
      `output_video was not jarvis-video-result:// (got ${out.slice(0, 80) || 'empty'})`
  }

  // 7) Idempotency — process same completion again
  const second = await handleShotstackWebhookPayload({
    type: 'edit',
    action: 'render',
    id: renderId,
    status: 'done',
    url: done.url,
    jarvis_job_id: jobId,
  })
  assert.equal(second.ok, true)
  assert.equal(second.duplicate, true)

  const { data: listed2 } = await admin.storage.from(JARVIS_VIDEO_BUCKET).list(`results/${jobId}`, {
    limit: 20,
  })
  const mp4s = (listed2 || []).filter((f) => f.name.endsWith('.mp4'))
  assert.equal(mp4s.length, 1, `expected 1 archived mp4, got ${mp4s.length}`)
  report.idempotency = 'PASS'

  // 8) Command Center surface
  const jobs = await listRecentVideoJobs(30)
  const seen = jobs.find((j) => j.id === jobId)
  assert.ok(seen, 'job missing from listRecentVideoJobs')
  assert.ok(seen.has_output || seen.output_video_available)
  assert.ok(
    seen.status === 'awaiting_approval' || seen.status === 'completed',
    `CC status ${seen.status}`
  )
  report.command_center_result = 'PASS'

  // Instagram must stay off
  assert.notEqual(process.env.LIVE_INSTAGRAM_PUBLISHING_ENABLED, 'true')

  console.log(JSON.stringify(report, null, 2))

  // Exit non-zero if public webhook unreachable (per requirements)
  if (report.webhook_reachable !== 'YES') {
    process.exit(2)
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: true, error: String(err?.message || err) }))
  process.exit(1)
})
