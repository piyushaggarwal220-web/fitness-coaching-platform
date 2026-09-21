import { createAdminClient } from '../src/lib/supabase/admin'
import { assignCoachToClient } from '../src/lib/admin/assign-coach'

const CLIENT_ID = '3bcc4be7-0eb7-4d3c-8e67-afd86a0eb5ed'
const PIYUSH_COACH_ID = 'fde68466-fb3e-4a24-a5f2-97a60a363690'

async function main() {
  const admin = createAdminClient()
  const result = await assignCoachToClient(admin, CLIENT_ID, PIYUSH_COACH_ID)
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email, coach_id, coaches(name)')
    .eq('id', CLIENT_ID)
    .single()

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
