import type { Metadata } from 'next'
import { Manrope, Outfit, Plus_Jakarta_Sans } from 'next/font/google'
import { BRAND_NAME } from '@/lib/brand'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-instant-brand',
  display: 'swap',
  weight: ['700', '800'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-instant-display',
  display: 'swap',
  weight: ['700', '800'],
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-instant-body',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: `Personalized Workout & Diet Plan — ₹99 | ${BRAND_NAME}`,
  description:
    'Get a personalized workout and diet plan built around your goals, lifestyle and preferences. Choose your plan from ₹49. One-time payment.',
  openGraph: {
    title: `Personalized Workout & Diet Plan — ₹99 | ${BRAND_NAME}`,
    description:
      'Get a personalized workout and diet plan built around your goals, lifestyle and preferences. Choose your plan from ₹49. One-time payment.',
    type: 'website',
  },
}

export default function CustomisedPlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${outfit.variable} ${manrope.variable} ${jakarta.variable} ${jakarta.className}`}>
      {children}
    </div>
  )
}
