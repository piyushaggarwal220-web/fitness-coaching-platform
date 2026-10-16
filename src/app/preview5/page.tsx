import type { Metadata, Viewport } from 'next'
import { OfferLanding } from '@/components/landing/OfferLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import '../preview2/offer.css'

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
    images: [{ url: '/images/lurvox/offer/hero-fat-loss.webp', alt: 'LURVOX coaching' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#121216',
}

export const dynamic = 'force-dynamic'

export default function Preview5Page() {
  return <OfferLanding coaches={loadOfferCoaches()} adPath="/preview5" durationOffer />
}
