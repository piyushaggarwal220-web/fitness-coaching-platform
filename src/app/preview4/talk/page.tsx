import type { Metadata } from 'next'
import { BeigeSite, TalkPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'Talk to a coach · LURVOX',
  description: 'Free call. Name and WhatsApp. The 84 days start only when you pay ₹999.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <TalkPage />
    </BeigeSite>
  )
}