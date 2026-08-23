import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const m = raw.match(/^AISENSY_API_KEY=(.*)$/m)
const apiKey = (m?.[1] || '').trim().replace(/^"|"$/g, '')

const guesses = [
  'checkin_due',
  'Checkin Due',
  'CHECKIN_DUE',
  'weekly_checkin',
  'weekly_checkin_reminder',
  'Weekly Check-in',
  'Weekly Checkin Reminder',
  'mid_week_checkin',
  'plan_ready',
  'Plan Ready',
  'plan_delivered',
  'plan_available',
  'missed_checkin',
  'Missed Checkin',
  'account_setup',
  'Account Setup',
  'onboarding_reminder',
  'Onboarding Reminder',
  'coach_replied',
  'Coach Replied',
  'unread_chat',
  'LURVOX Check-in',
  'LURVOX Plan Ready',
  'LURVOX Account Setup',
  'lurvox_checkin_due',
  'lurvox_plan_ready',
  'lurvox_missed_checkin',
  'lurvox_account_setup',
  'lurvox_onboarding_reminder',
]

const hits = []
for (const campaignName of guesses) {
  const res = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      campaignName,
      destination: '919999999999',
      userName: 'Probe',
      templateParams: ['Probe', 'Test'],
      source: 'lurvox-guess',
    }),
  })
  const body = (await res.text()).slice(0, 180)
  if (!body.includes('Campaign does not exist')) {
    hits.push({ campaignName, status: res.status, body })
  }
}

console.log(JSON.stringify({ tried: guesses.length, hits }, null, 2))
