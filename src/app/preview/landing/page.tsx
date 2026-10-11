import type { Metadata } from 'next'
import { OfferLanding } from '@/components/landing/OfferLanding'
import { loadOfferCoaches } from '@/components/landing/offer-coaches'
import './offer.css'

export const metadata: Metadata = {
  title: 'LURVOX preview',
  description: 'Preview of the LURVOX landing page.',
}

export const dynamic = 'force-dynamic'

export default function OfferLandingPage() {
  return <OfferLanding coaches={loadOfferCoaches()} />
}
