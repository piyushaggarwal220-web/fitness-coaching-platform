import { redirect } from 'next/navigation'

/** Legacy route — 7-day trial is retired; checkout is the canonical funnel. */
export default function TrialPage() {
  redirect('/checkout?plan=3_months')
}
