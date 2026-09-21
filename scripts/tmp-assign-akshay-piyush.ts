import { createAdminClient } from '../src/lib/supabase/admin'
import { assignCoachToClient } from '../src/lib/admin/assign-coach'

const CLIENT_ID = '07718589-f12f-4886-ad3a-cc8c065f9b57'
const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'

async function main() {
  const admin = createAdminClient()
  const result = await assignCoachToClient(admin, CLIENT_ID, PIYUSH_COACH_ID)
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, name, email, coach_id')
    .eq('id', CLIENT_ID)
    .single()

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const { data: coach } = await admin
    .from('coaches')
    .select('id, name')
    .eq('id', profile.coach_id)
    .maybeSingle()

  console.log(
    JSON.stringify(
      {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        coach_id: profile.coach_id,
        coach_name: coach?.name ?? null,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
