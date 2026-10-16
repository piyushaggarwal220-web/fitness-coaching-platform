import type { Metadata, Viewport } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import '../landing.css'

export const metadata: Metadata = {
  title: 'LURVOX: Full coaching from ₹249',
  description:
    'The same full plan for 1 month at ₹249 or 3 months at ₹499.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#f4efe6',
}

export const dynamic = 'force-dynamic'

export default function Preview4Page() {
  return <LandingPage />
}
