import type { Metadata } from 'next'
import { BeigeSite, FaqPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'Questions · LURVOX',
  description: 'The 84-day transformation is ₹999 once.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <FaqPage />
    </BeigeSite>
  )
}
