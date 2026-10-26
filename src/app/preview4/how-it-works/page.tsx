import type { Metadata } from 'next'
import { BeigeSite, HowPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'How it works · LURVOX',
  description: 'Pay ₹999 for 84 days, or book a coach call first.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <HowPage />
    </BeigeSite>
  )
}
