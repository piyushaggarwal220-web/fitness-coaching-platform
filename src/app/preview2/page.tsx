import type { Metadata, Viewport } from 'next'
import { OfferLanding } from '@/components/landing/OfferLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import './offer.css'

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
    images: [{ url: '/images/lurvox/offer/hero-fat-loss.webp', alt: 'LURVOX coaching' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#121216',
}

export const dynamic = 'force-dynamic'

export default function Preview2Page() {
  return <OfferLanding coaches={loadOfferCoaches()} adPath="/preview2" />
}
