import type { Metadata } from 'next'
import { BeigeSite, BeforePayPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'Before you pay · LURVOX',
  description: 'What happens after you pay ₹999 for the 84 days.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <BeforePayPage />
    </BeigeSite>
  )
}
