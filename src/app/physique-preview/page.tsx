import type { Metadata } from 'next'
import { PhysiquePreviewForm } from '@/components/marketing/PhysiquePreview'

export const metadata: Metadata = {
  title: 'Plan preview',
  description: 'See an illustration of the direction your Lurvox plan aims for.',
  robots: { index: false, follow: false },
}

export default function PhysiquePreviewPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#0c0a09' }}>
      <PhysiquePreviewForm />
    </main>
  )
}
