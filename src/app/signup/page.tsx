import { redirect } from 'next/navigation'

/** Legacy route — checkout is the canonical account creation funnel. */
export default function SignupPage() {
  redirect('/checkout?plan=6_months')
}
