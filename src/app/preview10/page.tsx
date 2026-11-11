import type { Metadata, Viewport } from 'next'
import { Preview10Storefront } from '@/components/landing/Preview10Storefront'
import '../preview3/colour.css'

export const metadata: Metadata = {
  title: 'LURVOX: 6 months of coaching, ₹999',
  description:
    'A coach-written workout and diet. 6 months is ₹999 and is rewritten every week. 3 months is ₹599, rewritten every 14 days. The first plan usually arrives within 1–2 hours of your photos.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'LURVOX: 6 months of coaching, ₹999',
    description:
      'A coach-written workout and diet. 6 months is ₹999 and is rewritten every week. 3 months is ₹599, rewritten every 14 days. The first plan usually arrives within 1–2 hours of your photos.',
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
]

export default function Preview10Page() {
  return <Preview10Storefront coaches={COACHES} />
}
