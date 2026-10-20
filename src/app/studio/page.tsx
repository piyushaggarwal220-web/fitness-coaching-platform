import type { Metadata } from 'next'
import { StudioSite } from '@/components/studio/StudioSite'
import './studio.css'

export const metadata: Metadata = {
  title: 'LURVOX — online fitness coaching from ₹1,999',
  description:
    'A workout and a diet written for you. Check-ins in the app. Plans from ₹1,999 for 3 months, ₹3,499 for 6 months, and ₹5,999 for 12 months.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX — online fitness coaching from ₹1,999',
    description: 'A workout and a diet written for you, rewritten from your check-ins.',
    type: 'website',
    images: [{ url: '/images/lurvox/studio/hero.webp', alt: 'LURVOX coaching' }],
  },
}

export default function StudioPage() {
  return <StudioSite />
}
