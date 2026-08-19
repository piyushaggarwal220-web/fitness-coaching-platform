import Link from 'next/link'
import { redirect } from 'next/navigation'
import { brandTitle } from '@/lib/brand'

export const metadata = {
  title: brandTitle('Refund Policy'),
}

/** External refund pages collapse into Terms — no separate public guarantee copy. */
export default function RefundPolicyPage() {
  redirect('/terms#payments-refunds-guarantees')
}
