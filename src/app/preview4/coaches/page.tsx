import type { Metadata } from 'next'
import { BeigeSite, CoachesPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'Coaches · LURVOX',
  description: 'Piyush Aggarwal and Rakshit Mohla. Book a free call or start the 84 days.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <CoachesPage />
    </BeigeSite>
  )
}
