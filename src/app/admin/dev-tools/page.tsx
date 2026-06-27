import { notFound } from 'next/navigation'
import { isDevToolkitEnabledClient } from '@/lib/dev-mode'
import DevToolsClient from './DevToolsClient'

export default function DevToolsPage() {
  if (!isDevToolkitEnabledClient()) {
    notFound()
  }

  return <DevToolsClient />
}
