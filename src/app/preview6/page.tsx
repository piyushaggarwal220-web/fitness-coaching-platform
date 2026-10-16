import type { Metadata, Viewport } from 'next'
import { ColourLanding } from '@/components/landing/ColourLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import '../preview3/colour.css'

export const metadata: Metadata = {
  title: 'LURVOX: Full coaching from ₹249',
  description:
    'The same full plan for 1 month at ₹249 or 3 months at ₹499. Workout, diet, cardio, supplements, and every goal.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX: Full coaching from ₹249',
    description:
      'The same full plan for 1 month at ₹249 or 3 months at ₹499. Workout, diet, cardio, supplements, and every goal.',
    type: 'website',
    images: [{ url: '/landing/coach-piyush-dark.webp', alt: 'LURVOX coach Piyush Aggarwal' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#12100f',
}

export const dynamic = 'force-dynamic'

export default function Preview6Page() {
  return <ColourLanding coaches={loadOfferCoaches()} durationOffer />
}
