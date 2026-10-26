import type { Metadata } from 'next'
import { BeigeSite, ProgramPage } from '@/components/landing/beige-site'

export const metadata: Metadata = {
  title: 'The 84 days · LURVOX',
  description: 'Twelve weekly plans across 84 days. ₹999 once.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <BeigeSite>
      <ProgramPage />
    </BeigeSite>
  )
}
