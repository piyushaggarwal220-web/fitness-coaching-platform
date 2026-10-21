import type { Metadata } from 'next'
import { StudioSite } from '@/components/studio/StudioSite'
import './studio.css'

export const metadata: Metadata = {
  title: 'LURVOX — online fitness coaching from ₹899',
  description:
    'A workout and a diet written for you. Check-ins in the app. Plans from ₹899 for 3 months, ₹1,499 for 6 months, and ₹2,299 for 12 months.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX — online fitness coaching from ₹899',
    description: 'A workout and a diet written for you, rewritten from your check-ins.',
    type: 'website',
    images: [{ url: '/images/lurvox/studio/hero.webp', alt: 'LURVOX coaching' }],
  },
}

export default function StudioPage() {
  return <StudioSite />
}
