/**
 * Video editing foundation verification (offline + optional Shotstack live auth).
 * TEST provider remains the default deterministic path.
 * Live Shotstack calls only run when VIDEO_EDIT_PROVIDER=shotstack and API key is present.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getTool } from '../src/lib/jarvis/tools/registry'
import { ensureJarvisToolsRegistered } from '../src/lib/jarvis/tools/builtins'
import {
  StubVideoEditProvider,
  TestVideoEditProvider,
  getVideoEditProvider,
  describeVideoProviderConfig,
} from '../src/lib/jarvis/video/provider'
import {
  validateVideoUpload,
  validateSourceReferenceOrUrl,
} from '../src/lib/jarvis/video/sources'
import {
  buildShortFormFitnessReelPlan,
  SHORT_FORM_FITNESS_REEL,
  MAX_VARIANTS_PER_JOB,
} from '../src/lib/jarvis/video/presets'
import { buildShotstackEdit, shotstackEditMetadata } from '../src/lib/jarvis/video/shotstack/edit-builder'
import { estimateShotstackCostUsd, mapShotstackStatusToJarvis } from '../src/lib/jarvis/video/shotstack/client'

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

ensureJarvisToolsRegistered()

async function testToolsRegistered() {
  for (const name of [
    'video.provider_status',
    'video.find_sources',
    'video.create_edit_job',
    'video.list_jobs',
    'video.analyze',
    'video.render',
    'video.cancel',
    'instagram.generate_draft',
    'instagram.plan_content',
    'instagram.publish',
  ]) {
    assert.ok(getTool(name), `missing tool ${name}`)
  }
  assert.equal(getTool('video.analyze')?.riskClass, 'READ')
  assert.equal(getTool('video.create_edit_job')?.riskClass, 'LOW_RISK')
  assert.equal(getTool('instagram.publish')?.riskClass, 'SIGNIFICANT')
  assert.equal(getTool('instagram.publish')?.requiresApproval, true)
}

async function testStubHonesty() {
  const stub = new StubVideoEditProvider()
  const render = await stub.render({
    jobId: 'x',
    sourceVideo: 'jarvis-video://00000000-0000-4000-8000-000000000001',
    plan: buildShortFormFitnessReelPlan(),
  })
  assert.notEqual(render.status, 'completed')
  assert.equal(render.output_video ?? null, null)
}

async function testTestPipeline() {
  const prev = process.env.VIDEO_EDIT_PROVIDER
  process.env.VIDEO_EDIT_PROVIDER = 'test'
  const p = getVideoEditProvider()
  assert.equal(p.name, 'test')
  assert.equal(p.kind, 'TEST')

  const analysis = await p.analyzeVideo({
    jobId: 'verify-1',
    sourceVideo: 'jarvis-video://00000000-0000-4000-8000-000000000099',
  })
  assert.equal(analysis.available, true)

  const rendered = await p.render({
    jobId: 'verify-1',
    sourceVideo: 'jarvis-video://00000000-0000-4000-8000-000000000099',
    plan: buildShortFormFitnessReelPlan({ duration_target_sec: 30 }),
  })
  assert.equal(rendered.status, 'completed')
  assert.ok(rendered.output_video)
  assert.equal(rendered.provider_kind, 'TEST')

  if (prev === undefined) delete process.env.VIDEO_EDIT_PROVIDER
  else process.env.VIDEO_EDIT_PROVIDER = prev
}

function testSecurityGuards() {
  assert.equal(
    validateSourceReferenceOrUrl('http://169.254.169.254/latest/meta-data/').ok,
    false
  )
  assert.equal(validateSourceReferenceOrUrl('../../etc/passwd').ok, false)
  assert.equal(
    validateVideoUpload({
      filename: 'ok.webm',
      mimeType: 'video/webm',
      byteSize: 50,
    }).ok,
    true
  )
}

function testShotstackEditJson() {
  const plan = buildShortFormFitnessReelPlan({
    duration_target_sec: 30,
    hooks: ['Lock your core'],
    clips: [{ start_sec: 0, end_sec: 12, purpose: 'hook' }, { start_sec: 20, end_sec: 40, purpose: 'demo' }],
  })
  assert.equal(SHORT_FORM_FITNESS_REEL, 'short_form_fitness_reel')
  assert.ok(plan.variants.length <= MAX_VARIANTS_PER_JOB)

  const edit = buildShotstackEdit({
    sourceUrl: 'https://example.com/private-signed.mp4',
    plan,
    sourceDurationSec: 90,
    callbackUrl: 'https://example.com/api/admin/jarvis/video-webhook?jarvis_job_id=abc',
    captionLines: ['Lock your core'],
  })
  assert.equal(edit.output.format, 'mp4')
  assert.equal(edit.output.size.width, 1080)
  assert.equal(edit.output.size.height, 1920)
  assert.equal(edit.output.fps, 30)
  assert.ok(edit.callback)
  const meta = shotstackEditMetadata(edit)
  assert.ok(meta.estimated_output_duration_sec <= 60)
  assert.ok(meta.clip_count >= 1)
  // No secrets in edit JSON
  assert.equal(JSON.stringify(edit).includes('API_KEY'), false)
}

function testShotstackStatusMapping() {
  assert.equal(mapShotstackStatusToJarvis('done'), 'completed')
  assert.equal(mapShotstackStatusToJarvis('failed'), 'failed')
  assert.equal(mapShotstackStatusToJarvis('rendering'), 'rendering')
  assert.equal(mapShotstackStatusToJarvis('queued'), 'queued')
  const cost = estimateShotstackCostUsd(30)
  assert.ok(cost > 0 && cost <= 5)
}

function testNoSecretLeakageInDescribe() {
  const cfg = describeVideoProviderConfig()
  const dumped = JSON.stringify(cfg)
  assert.equal(/sk-|x-api-key|Bearer\s+\S+/i.test(dumped), false)
}

async function testShotstackLiveIfConfigured() {
  loadEnvLocal()
  if (process.env.VIDEO_EDIT_PROVIDER !== 'shotstack' || !process.env.VIDEO_EDIT_API_KEY?.trim()) {
    console.log(
      JSON.stringify({
        shotstack_live: 'skipped',
        reason: 'VIDEO_EDIT_PROVIDER!=shotstack or VIDEO_EDIT_API_KEY missing',
      })
    )
    return {
      connected: false,
      render_submitted: false,
      provider_render_id: null as string | null,
      mp4_returned: false,
      result_stored: null as string | null,
    }
  }

  // Isolate provider selection
  process.env.VIDEO_EDIT_PROVIDER = 'shotstack'
  const { describeShotstackConnection, ShotstackVideoEditProvider } = await import(
    '../src/lib/jarvis/video/shotstack/provider'
  )
  const { shotstackProbe, shotstackCreateRender, shotstackGetRender } = await import(
    '../src/lib/jarvis/video/shotstack/client'
  )
  const conn = describeShotstackConnection()
  assert.equal(conn.configured, true)
  assert.equal(conn.provider, 'shotstack')

  // Public sample asset for auth/probe only (not a LURVOX gym upload)
  const sample =
    'https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/footage/beach-overhead.mp4'
  const probe = await shotstackProbe(sample)
  if (!probe.ok) {
    console.log(
      JSON.stringify({
        shotstack_live: 'auth_or_probe_failed',
        error_code: probe.error_code,
        error_message: probe.error_message,
        // never include key
      })
    )
    return {
      connected: false,
      render_submitted: false,
      provider_render_id: null as string | null,
      mp4_returned: false,
      result_stored: null as string | null,
      error: probe.error_message,
    }
  }

  const provider = new ShotstackVideoEditProvider()
  const plan = buildShortFormFitnessReelPlan({
    duration_target_sec: 7,
    hooks: ['Train hard'],
    clips: [{ start_sec: 0, end_sec: 7, purpose: 'sample' }],
  })
  const edit = buildShotstackEdit({
    sourceUrl: sample,
    plan,
    sourceDurationSec: 30,
    captionLines: ['Train hard'],
  })
  // Intentionally no callback for this verify (webhook URL may be unset)
  const created = await shotstackCreateRender(edit as unknown as Record<string, unknown>)
  if (!created.ok || !created.data?.response?.id) {
    // If auth failed on default stage, try the alternate environment once
    const alt = process.env.SHOTSTACK_ENV === 'stage' ? 'v1' : 'stage'
    const prev = process.env.SHOTSTACK_ENV
    process.env.SHOTSTACK_ENV = alt
    const retryEdit = buildShotstackEdit({
      sourceUrl: sample,
      plan,
      sourceDurationSec: 30,
      captionLines: ['Train hard'],
    })
    const retry = await shotstackCreateRender(retryEdit as unknown as Record<string, unknown>)
    if (prev === undefined) delete process.env.SHOTSTACK_ENV
    else process.env.SHOTSTACK_ENV = prev

    if (retry.ok && retry.data?.response?.id) {
      const renderId = retry.data.response.id
      const status = await shotstackGetRender(renderId)
      console.log(
        JSON.stringify({
          shotstack_live: 'ok',
          stage: alt,
          note: `Auth succeeded on ${alt} after ${conn.stage} failed. Set SHOTSTACK_ENV=${alt} in .env.local.`,
          render_submitted: true,
          provider_render_id: renderId,
          remote_status: status.data?.response?.status ?? null,
          mp4_returned: Boolean(status.data?.response?.url),
        })
      )
      return {
        connected: true,
        render_submitted: true,
        provider_render_id: renderId,
        mp4_returned: Boolean(status.data?.response?.url),
        result_stored: status.data?.response?.url ? 'shotstack_temporary_url' : null,
        remote_status: status.data?.response?.status ?? null,
        recommended_SHOTSTACK_ENV: alt,
      }
    }

    console.log(
      JSON.stringify({
        shotstack_live: 'probe_ok_render_failed',
        error_code: created.error_code,
        error_message: created.error_message,
        tried_alt_stage: alt,
        alt_error_code: retry.error_code,
        alt_error_message: retry.error_message,
      })
    )
    return {
      connected: false,
      render_submitted: false,
      provider_render_id: null as string | null,
      mp4_returned: false,
      result_stored: null as string | null,
      error: created.error_message,
    }
  }

  const renderId = created.data.response.id
  // Single gentle status poll — do not wait forever
  const status = await shotstackGetRender(renderId)
  const remoteStatus = status.data?.response?.status ?? null
  const url = status.data?.response?.url ?? null

  console.log(
    JSON.stringify({
      shotstack_live: 'ok',
      stage: conn.stage,
      probe_ok: true,
      render_submitted: true,
      provider_render_id: renderId,
      remote_status: remoteStatus,
      mp4_returned: Boolean(url),
      note: 'Sample public footage used for connection verify — not a LURVOX gym upload. Callback URL not required for queue.',
    })
  )

  assert.equal(provider.name, 'shotstack')
  return {
    connected: true,
    render_submitted: true,
    provider_render_id: renderId,
    mp4_returned: Boolean(url),
    result_stored: url ? 'shotstack_temporary_url' : null,
    remote_status: remoteStatus,
  }
}

async function main() {
  await testToolsRegistered()
  await testStubHonesty()
  await testTestPipeline()
  testSecurityGuards()
  testShotstackEditJson()
  testShotstackStatusMapping()
  testNoSecretLeakageInDescribe()

  const test = new TestVideoEditProvider()
  const full = await test.process({
    id: 'full-1',
    source_video: 'jarvis-video://00000000-0000-4000-8000-000000000001',
    edit_instructions: {},
  })
  assert.equal(full.status, 'completed')

  const live = await testShotstackLiveIfConfigured()

  console.log('verify:video OK')
  console.log(
    JSON.stringify(
      {
        provider_default: describeVideoProviderConfig(),
        live,
        approval: {
          instagram_publish_requires_approval: true,
          live_instagram_publishing_enabled: process.env.LIVE_INSTAGRAM_PUBLISHING_ENABLED === 'true',
        },
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
