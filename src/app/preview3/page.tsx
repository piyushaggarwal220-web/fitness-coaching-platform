import type { Metadata, Viewport } from 'next'
import { ColourLanding } from '@/components/landing/ColourLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import './colour.css'

export const metadata: Metadata = {
  title: 'LURVOX: Online Fitness Coaching from ₹900',
  description:
    'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹900 for 90 days.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX: Online Fitness Coaching from ₹900',
    description:
      'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹900 for 90 days.',
    type: 'website',
    images: [{ url: '/landing/coach-piyush-dark.webp', alt: 'LURVOX coach Piyush Aggarwal' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#12100f',
}

export const dynamic = 'force-dynamic'

export default function Preview3Page() {
  return <ColourLanding coaches={loadOfferCoaches()} />
}
