import { randomBytes } from 'node:crypto'
import { assignCoachToClient } from '@/lib/admin/assign-coach'
import {
  applyCompletedOnboarding,
  generateFakeClientEmail,
  generateFakeOnboardingForm,
} from '@/lib/admin/fake-client-generator'
import { getPortalLoginUrl } from '@/lib/admin/portal-urls'
import { assertTrialClient } from '@/lib/admin/trial-client-guard'
import { hasAccessSourceColumn } from '@/lib/db/profile-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccessSource } from '@/lib/entitlements'

export { listTrialClients } from '@/lib/admin/trial-client-guard'
export { resetTrialClient } from '@/lib/admin/trial-client-reset'
export type { ResetTrialClientResult } from '@/lib/admin/trial-client-reset'
export type { TrialClientSummary } from '@/lib/admin/trial-client-guard'

export const DEMO_ADMIN_EMAIL = 'admin@test.local'
export const DEMO_COACH_EMAIL = 'coach@test.local'
export const DEMO_CLIENT_EMAIL = 'client@test.local'

export type CreatedAccountCredentials = {
  userId: string
  email: string
  password: string
  role: string
  loginUrl: string
  created: boolean
  message: string
  coachId?: string
  clientId?: string
}

export function generateSecurePassword(length = 16): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&'
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient()
  const normalized = email.trim().toLowerCase()

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (profile?.id) return profile.id

  const { data: listed, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)

  const match = listed.users.find((user) => user.email?.toLowerCase() === normalized)
  return match?.id ?? null
}

async function upsertProfile(input: {
  userId: string
  email: string
  name: string
  role?: 'client' | 'coach' | 'admin' | 'super_admin'
  paymentConfirmed?: boolean
  accessSource?: AccessSource | null
  fitnessGoal?: string | null
  coachId?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const includeAccessSource = await hasAccessSourceColumn()

  const payload: Record<string, unknown> = {
    id: input.userId,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role ?? 'client',
    payment_confirmed: input.paymentConfirmed ?? false,
    onboarding_complete: false,
    fitness_goal: input.fitnessGoal?.trim() || null,
    coach_id: input.coachId ?? null,
    updated_at: now,
  }

  if (includeAccessSource && input.accessSource) {
    payload.access_source = input.accessSource
  }

  const { error } = await admin.from('profiles').upsert(payload)
  if (error) throw new Error(`Failed to upsert profile: ${error.message}`)
}

export type CreateTrialClientInput = {
  name: string
  email: string
  password: string
  fitnessGoal?: string | null
  coachId?: string | null
}

/** Create a trial client with full platform access (no Razorpay). */
export async function createTrialClient(input: CreateTrialClientInput): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()
  const name = input.name.trim()

  if (!email || !password || !name) {
    throw new Error('Name, email, and password are required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    throw new Error('An account with this email already exists.')
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'client' },
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create auth user')
  }

  await upsertProfile({
    userId: authData.user.id,
    email,
    name,
    role: 'client',
    paymentConfirmed: true,
    accessSource: 'admin_trial',
    fitnessGoal: input.fitnessGoal,
    coachId: input.coachId ?? null,
  })

  if (input.coachId) {
    const { error: assignError } = await assignCoachToClient(admin, authData.user.id, input.coachId)
    if (assignError) throw new Error(assignError)
  }

  return {
    userId: authData.user.id,
    clientId: authData.user.id,
    email,
    password,
    role: 'client',
    loginUrl: getPortalLoginUrl('client'),
    created: true,
    message: 'Trial client created with full platform access.',
  }
}

export type CreateTrialCoachInput = {
  name: string
  email: string
  password: string
}

/** Create a trial coach with immediate coach portal access. */
export async function createTrialCoach(input: CreateTrialCoachInput): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()
  const name = input.name.trim()

  if (!email || !password || !name) {
    throw new Error('Name, email, and password are required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', existingId)
      .maybeSingle()

    if (coachRow?.id) {
      throw new Error('An account with this email already exists.')
    }
  }

  let userId = existingId

  if (!userId) {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'coach' },
    })

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? 'Failed to create auth user')
    }

    userId = authData.user.id
  }

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .insert({
      user_id: userId,
      name,
      hard_cap: 100,
    })
    .select('id')
    .single()

  if (coachError || !coachRow) {
    throw new Error(coachError?.message ?? 'Failed to create coach record')
  }

  await upsertProfile({
    userId,
    email,
    name,
    role: 'coach',
    paymentConfirmed: false,
    accessSource: null,
  })

  return {
    userId,
    coachId: coachRow.id,
    email,
    password,
    role: 'coach',
    loginUrl: getPortalLoginUrl('coach'),
    created: true,
    message: 'Trial coach created.',
  }
}

async function ensureAuthUser(input: {
  email: string
  password: string
  name: string
  metadataRole: string
}): Promise<{ userId: string; created: boolean }> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    return { userId: existingId, created: false }
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name, role: input.metadataRole },
  })

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? 'Failed to create auth user')
  }

  return { userId: authData.user.id, created: true }
}

/** Ensure default super_admin demo account exists. */
export async function ensureDemoAdminAccount(password?: string): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = DEMO_ADMIN_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', existingId)
      .maybeSingle()

    if (profile?.role !== 'super_admin') {
      await admin.from('profiles').update({ role: 'super_admin', updated_at: new Date().toISOString() }).eq('id', existingId)
    }

    return {
      userId: existingId,
      email,
      password: resolvedPassword,
      role: 'super_admin',
      loginUrl: getPortalLoginUrl('admin'),
      created: false,
      message: 'Admin account already exists.',
    }
  }

  const { userId, created } = await ensureAuthUser({
    email,
    password: resolvedPassword,
    name: 'Demo Admin',
    metadataRole: 'super_admin',
  })

  await upsertProfile({
    userId,
    email,
    name: 'Demo Admin',
    role: 'super_admin',
    paymentConfirmed: false,
    accessSource: null,
  })

  return {
    userId,
    email,
    password: resolvedPassword,
    role: 'super_admin',
    loginUrl: getPortalLoginUrl('admin'),
    created,
    message: created ? 'Demo admin account created.' : 'Admin account already exists.',
  }
}

/** Ensure default trial coach demo account exists. */
export async function ensureDemoCoachAccount(password?: string): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()
  const email = DEMO_COACH_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id')
      .eq('user_id', existingId)
      .maybeSingle()

    if (coachRow?.id) {
      return {
        userId: existingId,
        coachId: coachRow.id,
        email,
        password: resolvedPassword,
        role: 'coach',
        loginUrl: getPortalLoginUrl('coach'),
        created: false,
        message: 'Trial coach account already exists.',
      }
    }

    const { data: inserted, error: coachError } = await admin
      .from('coaches')
      .insert({ user_id: existingId, name: 'Demo Coach', hard_cap: 100 })
      .select('id')
      .single()

    if (coachError || !inserted) {
      throw new Error(coachError?.message ?? 'Failed to create coach record for existing user')
    }

    await upsertProfile({
      userId: existingId,
      email,
      name: 'Demo Coach',
      role: 'coach',
      paymentConfirmed: false,
      accessSource: null,
    })

    return {
      userId: existingId,
      coachId: inserted.id,
      email,
      password: resolvedPassword,
      role: 'coach',
      loginUrl: getPortalLoginUrl('coach'),
      created: true,
      message: 'Demo coach account created.',
    }
  }

  const result = await createTrialCoach({
    name: 'Demo Coach',
    email,
    password: resolvedPassword,
  })

  return {
    ...result,
    created: true,
    message: 'Demo coach account created.',
  }
}

/** Ensure default trial client demo account exists. */
export async function ensureDemoClientAccount(
  password?: string,
  coachId?: string | null
): Promise<CreatedAccountCredentials> {
  const email = DEMO_CLIENT_EMAIL
  const resolvedPassword = password ?? generateSecurePassword()

  const existingId = await findUserIdByEmail(email)
  if (existingId) {
    const admin = createAdminClient()
    const includeAccessSource = await hasAccessSourceColumn()
    const fixPayload: Record<string, unknown> = {
      payment_confirmed: true,
      role: 'client',
      updated_at: new Date().toISOString(),
    }
    if (includeAccessSource) fixPayload.access_source = 'admin_trial'
    await admin.from('profiles').update(fixPayload).eq('id', existingId)

    return {
      userId: existingId,
      clientId: existingId,
      email,
      password: resolvedPassword,
      role: 'client',
      loginUrl: getPortalLoginUrl('client'),
      created: false,
      message: 'Trial client account already exists.',
    }
  }

  const result = await createTrialClient({
    name: 'Demo Client',
    email,
    password: resolvedPassword,
    fitnessGoal: 'fat_loss',
    coachId: coachId ?? null,
  })

  return {
    ...result,
    created: true,
    message: 'Demo client account created.',
  }
}

export async function ensureAllDemoAccounts(): Promise<CreatedAccountCredentials[]> {
  const admin = await ensureDemoAdminAccount()
  const coach = await ensureDemoCoachAccount()
  const client = await ensureDemoClientAccount(undefined, coach.coachId ?? null)
  return [admin, coach, client]
}

export async function listCoachesForAssignment(): Promise<
  Array<{ id: string; name: string | null; user_id: string }>
> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coaches')
    .select('id, name, user_id')
    .order('name')

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Create a fake trial client with realistic onboarding data already completed. */
export async function createFakeTrialClient(
  coachId?: string | null
): Promise<CreatedAccountCredentials> {
  const form = generateFakeOnboardingForm()
  const email = generateFakeClientEmail()
  const password = generateSecurePassword()

  const account = await createTrialClient({
    name: form.name,
    email,
    password,
    fitnessGoal: form.fitness_goal,
    coachId: coachId ?? null,
  })

  await applyCompletedOnboarding(account.userId, email, form)

  return {
    ...account,
    message: 'Fake trial client created with completed onboarding — ready for AI plan generation.',
  }
}

/** Reset password for a trial client (admin_trial only). */
export async function resetTrialClientPassword(
  clientId: string
): Promise<CreatedAccountCredentials> {
  const profile = await assertTrialClient(clientId)
  const password = generateSecurePassword()
  const admin = createAdminClient()

  const { error } = await admin.auth.admin.updateUserById(clientId, { password })
  if (error) throw new Error(error.message)

  return {
    userId: clientId,
    clientId,
    email: profile.email ?? '',
    password,
    role: 'client',
    loginUrl: getPortalLoginUrl('client'),
    created: false,
    message: 'Trial client password reset.',
  }
}

/** Reset password for a trial coach account. */
export async function resetTrialCoachPassword(
  coachUserId: string
): Promise<CreatedAccountCredentials> {
  const admin = createAdminClient()

  const { data: coachRow, error: coachError } = await admin
    .from('coaches')
    .select('id, user_id')
    .eq('user_id', coachUserId)
    .maybeSingle()

  if (coachError) throw new Error(coachError.message)
  if (!coachRow) throw new Error('Coach not found.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('email, name')
    .eq('id', coachUserId)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)
  if (!profile?.email) throw new Error('Coach profile not found.')

  const password = generateSecurePassword()
  const { error } = await admin.auth.admin.updateUserById(coachUserId, { password })
  if (error) throw new Error(error.message)

  return {
    userId: coachUserId,
    coachId: coachRow.id,
    email: profile.email,
    password,
    role: 'coach',
    loginUrl: getPortalLoginUrl('coach'),
    created: false,
    message: 'Trial coach password reset.',
  }
}
