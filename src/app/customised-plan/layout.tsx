import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { BRAND_NAME } from '@/lib/brand'

export const metadata: Metadata = {
  title: `${BRAND_NAME} · Customised fitness plan`,
  description:
    'Personalised workout and diet plans from ₹49. One time payment. Delivered to email and app within a few hours. Made by the coach. Not live coaching.',
}

const fontVars = {
  '--font-instant-brand': "'Outfit', sans-serif",
  '--font-instant-display': "'Manrope', sans-serif",
  '--font-instant-body': "'Plus Jakarta Sans', sans-serif",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
} as CSSProperties

export default function CustomisedPlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={fontVars}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Outfit:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />
      {children}
    </div>
  )
}
