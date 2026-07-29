'use client'

import { useEffect } from 'react'
import { isChunkLoadError, reloadForNewDeployment } from '@/lib/chunk-load-recovery'

/**
 * After a production deploy, open tabs can still reference old `/_next/static`
 * chunk hashes (404). Reload once so clients pick up the new build.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isChunkLoadError(event.error) && !isChunkLoadError(event.message)) return
      if (reloadForNewDeployment('error')) {
        event.preventDefault()
      }
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) return
      if (reloadForNewDeployment('rejection')) {
        event.preventDefault()
      }
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
