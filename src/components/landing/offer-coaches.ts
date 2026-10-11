import fs from 'node:fs'
import path from 'node:path'
import type { CoachResult } from '@/components/landing/OfferLanding'

const COACH_DIR = path.join(process.cwd(), 'public', 'landing', 'coaches')

function coachPhoto(key: string, stage: 'before' | 'after'): string | null {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    const file = `${key}-${stage}.${ext}`
    if (fs.existsSync(path.join(COACH_DIR, file))) return `/landing/coaches/${file}`
  }
  return null
}

export function loadOfferCoaches(): CoachResult[] {
  return [
    {
      key: 'piyush',
      name: 'Piyush Aggarwal',
      handle: '@maximusvault',
      href: 'https://www.instagram.com/maximusvault/',
      portrait: '/landing/coach-piyush-dark.webp',
      before: coachPhoto('piyush', 'before'),
      after: coachPhoto('piyush', 'after'),
    },
    {
      key: 'rakshit',
      name: 'Rakshit Mohla',
      handle: '@rakshitmohla_',
      href: 'https://www.instagram.com/rakshitmohla_/',
      portrait: '/landing/coach-rakshit-dark.webp',
      before: coachPhoto('rakshit', 'before'),
      after: coachPhoto('rakshit', 'after'),
    },
  ]
}
