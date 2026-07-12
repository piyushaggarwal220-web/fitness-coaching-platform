import { redirect } from 'next/navigation'

/** Legacy route — progress stats live on Journey. */
export default function ProgressRedirectPage() {
  redirect('/journey')
}
