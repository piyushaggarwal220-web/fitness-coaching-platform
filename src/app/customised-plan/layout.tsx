import type { Metadata } from 'next'
import { Outfit, Plus_Jakarta_Sans, Syne } from 'next/font/google'
import { BRAND_NAME } from '@/lib/brand'

/** Wordmark / LURVOX lockups only */
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-instant-brand',
  display: 'swap',
  weight: ['700', '800'],
})

/** Section titles + hero headline */
const syne = Syne({
  subsets: ['latin'],
  variable: '--font-instant-display',
  display: 'swap',
  weight: ['700', '800'],
})

/** Body copy, FAQ, bullets, buttons */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-instant-body',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Customised fitness plan`,
  description:
    'AI-built personalized workout and diet plans from ₹49. One-time payment. Delivered to email and app within a few hours. Not live coaching.',
}

export default function CustomisedPlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${outfit.variable} ${syne.variable} ${jakarta.variable} ${jakarta.className}`}>
      {children}
    </div>
  )
}
