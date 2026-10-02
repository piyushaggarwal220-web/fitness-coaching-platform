import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/LandingPage'
import './landing.css'

export const metadata: Metadata = {
  title: 'LURVOX — Online Fitness Coaching From ₹599',
  description:
    'Personalized workout and diet coaching for 90 days. Starting from ₹599. Check-ins, tracking, and coach chat in one app.',
  openGraph: {
    title: 'LURVOX — Online Fitness Coaching From ₹599',
    description:
      'Personalized coaching built around your body, goals and lifestyle. Starting from ₹599.',
    type: 'website',
  },
}

export default function Home() {
  return <LandingPage />
}
