import { redirect } from 'next/navigation'

/** Avoid /admin/coaches/[id] swallowing "transformations" as a coach UUID. */
export default function AdminCoachesTransformationsRedirect() {
  redirect('/admin/transformation-scores')
}
