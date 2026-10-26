import type { Metadata, Viewport } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'

export const metadata: Metadata = {
  title: 'LURVOX: 84-day transformation, ₹999',
  description: 'One coaching block. 84 days. ₹999 once. Or talk to a coach first.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#f4efe6',
}

export const dynamic = 'force-dynamic'

export default function Preview4Page() {
  return <LandingPage />
}
