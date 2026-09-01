import { NextResponse } from 'next/server'
import { backfillMetaPurchases } from '@/lib/analytics/meta-purchase-backfill'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorizeCron(request: Request): boolean {
  const secrets = [process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
      return false
    }
    return true
  }

  const header = request.headers.get('authorization')
  const query = new URL(request.url).searchParams.get('secret')
  return secrets.some((secret) => header === `Bearer ${secret}` || query === secret)
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50
  const dryRun = url.searchParams.get('dryRun') === '1'

  const summary = await backfillMetaPurchases({ limit, dryRun })
  if (summary.errors.length > 0 && summary.sent === 0 && summary.checked === 0) {
    return NextResponse.json({ ok: false, ...summary }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...summary })
}
