import type { Metadata, Viewport } from 'next'
import { OfferLanding } from '@/components/landing/OfferLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import './preview/landing/offer.css'

export const metadata: Metadata = {
  title: 'LURVOX: Online Fitness Coaching from ₹1,999',
  description:
    'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹1,999 for 90 days.',
  openGraph: {
    title: 'LURVOX: Online Fitness Coaching from ₹1,999',
    description:
      'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹1,999 for 90 days.',
    type: 'website',
    images: [{ url: '/images/lurvox/offer/hero-fat-loss.webp', alt: 'LURVOX coaching' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#121216',
}

export const dynamic = 'force-dynamic'

export default function Home() {
  return <OfferLanding coaches={loadOfferCoaches()} />
}
