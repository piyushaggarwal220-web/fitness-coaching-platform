import { notFound } from 'next/navigation'
import { isTestModeEnabled } from '@/lib/test-mode'
import DevToolsClient from './DevToolsClient'

export default function DevToolsPage() {
  if (!isTestModeEnabled()) {
    notFound()
  }

  return <DevToolsClient />
}
