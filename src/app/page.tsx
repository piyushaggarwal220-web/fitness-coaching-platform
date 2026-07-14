import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import { LandingPage } from '@/components/landing/LandingPage'
import './landing.css'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-landing-display',
  display: 'swap',
  weight: ['600', '700', '800'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-landing-body',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'LURVOX — Personal Fitness Coaching From ₹500',
  description:
    'Personalized workout plans, diet coaching, weekly reviews, and daily tracking. Premium coaching at an incredibly affordable price.',
}

export default function Home() {
  return (
    <div className={`${syne.variable} ${dmSans.variable}`}>
      <LandingPage />
    </div>
  )
}
