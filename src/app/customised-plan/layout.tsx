import type { Metadata } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import { BRAND_NAME } from '@/lib/brand'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-instant-body',
  display: 'swap',
  weight: ['400', '600', '700', '800'],
})

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-instant-display',
  display: 'swap',
  weight: ['700', '800'],
})

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Customised fitness plan`,
  description:
    'AI-built personalized workout and diet plans from ₹49. One-time payment. Delivered to email and app within a few hours. Not live coaching.',
}

export default function CustomisedPlanLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${dmSans.variable} ${syne.variable}`}>{children}</div>
}
