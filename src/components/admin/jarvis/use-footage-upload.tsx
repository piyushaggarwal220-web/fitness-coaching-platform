'use client'

import { useCallback, useRef, useState } from 'react'

export type FootageReady = {
  filename: string
  sessionId: string
  sourceRef: string
  sourceId?: string
}

export type FootageAttachState =
  | { status: 'idle' }
  | { status: 'selected'; file: File; filename: string }
  | { status: 'uploading'; filename: string }
  | { status: 'ready'; filename: string; sessionId: string; sourceRef: string; sourceId?: string }
  | { status: 'error'; filename?: string; message: string }

/**
 * Existing Jarvis video ingest: create_session → FormData POST /api/admin/jarvis/video-sources.
 * Does not invent progress; states reflect real request lifecycle only.
 */
export function useFootageUpload(opts?: {
  onReady?: (ready: FootageReady) => void
  reloadDashboard?: () => Promise<unknown> | unknown
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<FootageAttachState>({ status: 'idle' })

  const openPicker = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const clear = useCallback(() => {
    setState({ status: 'idle' })
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setState({ status: 'selected', file, filename: file.name })
  }, [])

  const uploadSelected = useCallback(async () => {
    if (state.status !== 'selected') return
    const { file, filename } = state
    setState({ status: 'uploading', filename })
    try {
      const sessionRes = await fetch('/api/admin/jarvis/video-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_session',
          title: filename.replace(/\.[^.]+$/, '') || 'Footage session',
          description: 'Operator upload from Jarvis command bar',
        }),
      })
      const sessionJson = await sessionRes.json()
      if (!sessionJson.success || !sessionJson.session?.id) {
        throw new Error(sessionJson.error || 'Could not create video session')
      }
      const sessionId = sessionJson.session.id as string
      const form = new FormData()
      form.set('file', file)
      form.set('sessionId', sessionId)
      const up = await fetch('/api/admin/jarvis/video-sources', { method: 'POST', body: form })
      const upJson = await up.json()
      if (!upJson.success) {
        throw new Error(upJson.error || 'Upload failed')
      }
      const sourceRef = String(upJson.source_ref || upJson.id || '')
      const ready: FootageReady = {
        filename,
        sessionId,
        sourceRef,
        sourceId: upJson.id ? String(upJson.id) : undefined,
      }
      setState({
        status: 'ready',
        filename,
        sessionId,
        sourceRef,
        sourceId: ready.sourceId,
      })
      await opts?.reloadDashboard?.()
      opts?.onReady?.(ready)
    } catch (e) {
      setState({
        status: 'error',
        filename,
        message: e instanceof Error ? e.message : 'Upload failed',
      })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [state, opts])

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.m4v"
      style={{ display: 'none' }}
      onChange={onFileChange}
    />
  )

  return {
    state,
    fileInput,
    openPicker,
    clear,
    uploadSelected,
    busy: state.status === 'uploading',
  }
}

export function analyzePromptForFootage(ready: FootageReady): string {
  return [
    `FOOTAGE ATTACHED: ${ready.filename}`,
    `video session ${ready.sessionId}`,
    ready.sourceRef ? `(source ${ready.sourceRef})` : '',
    'Use the Short-form Fitness Reel pipeline: analyze → opportunities → creative plan → EDL → Shotstack render (9:16).',
    'Do not invent macros. Do not publish. Wait for webhook confirmation before claiming render success.',
  ]
    .filter(Boolean)
    .join(' ')
}
