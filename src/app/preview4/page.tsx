import type { Metadata, Viewport } from 'next'
import { ColourStorefront } from '@/components/landing/ColourStorefront'
import '../preview3/colour.css'

export const metadata: Metadata = {
  title: 'LURVOX: Online Fitness Coaching from ₹599',
  description:
    'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹599 for 90 days.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX: Online Fitness Coaching from ₹599',
    description:
      'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹599 for 90 days.',
    type: 'website',
    images: [{ url: '/landing/instant-coach-piyush.png', alt: 'LURVOX coach Piyush Aggarwal' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#12100f',
}

export const dynamic = 'force-dynamic'

const COACHES = [
  {
    key: 'piyush' as const,
    name: 'Piyush Aggarwal',
    handle: '@maximusvault',
    href: 'https://www.instagram.com/maximusvault/',
  },
  {
    key: 'rakshit' as const,
    name: 'Rakshit Mohla',
    handle: '@rakshitmohla_',
    href: 'https://www.instagram.com/rakshitmohla_/',
  },
]

export default function Preview4Page() {
  return <ColourStorefront coaches={COACHES} />
}
