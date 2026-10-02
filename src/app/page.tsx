import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import './landing.css'

export const metadata: Metadata = {
  title: 'LURVOX: Online Fitness Coaching from ₹599',
  description:
    'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹599 for 90 days.',
  openGraph: {
    title: 'LURVOX: Online Fitness Coaching from ₹599',
    description:
      'Online fitness coaching. A personal workout, diet and coach check-ins. Starting from ₹599 for 90 days.',
    type: 'website',
    images: [{ url: '/images/lurvox/campaign/hero-fat-loss.webp', alt: 'LURVOX coaching' }],
  },
}

export default function Home() {
  return <LandingPage />
}
