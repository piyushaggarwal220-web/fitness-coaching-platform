import type { Metadata, Viewport } from 'next'
import { QuizV3Landing } from '@/components/landing/QuizV3Landing'
import { formatPreview7Inr, preview7AmountPaise } from '@/lib/payments/preview7-prices'

const fatLoss = formatPreview7Inr(preview7AmountPaise('3_months') ?? 0)
const muscle = formatPreview7Inr(preview7AmountPaise('6_months') ?? 0)
const athletic = formatPreview7Inr(preview7AmountPaise('12_months') ?? 0)
const title = `LURVOX: Online Fitness Coaching from ${fatLoss}`
const description = `Online fitness coaching. A personal workout, diet and coach check-ins. Fat loss ${fatLoss}, fat loss + muscle ${muscle}, athletic body ${athletic}.`

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: {
    title,
    description,
    type: 'website',
    images: [{ url: '/landing/coach-piyush-dark.webp', alt: 'LURVOX coach Piyush Aggarwal' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#100b08',
}

export const dynamic = 'force-dynamic'

export default function Preview7Page() {
  return <QuizV3Landing />
}
