import { CHAT_AFTER_ENROLLMENT_MESSAGE } from '@/lib/chat-availability'

export const DEMO_TOUR_STORAGE_KEY = 'lurvox-demo-tour'
export const DEMO_TOUR_OFFER_KEY = 'lurvox-demo-offer-tour'

export type DemoTourStep = {
  id: string
  selector: string
  title: string
  body: string
}

export const DEMO_TOUR_STEPS: DemoTourStep[] = [
  {
    id: 'home',
    selector: '[data-tour="nav-home"]',
    title: 'Home',
    body: 'Your daily hub. Plan status, check-ins, and what to do next live here.',
  },
  {
    id: 'tracker',
    selector: '[data-tour="nav-tracker"]',
    title: 'Tracker',
    body: 'Log today’s meals, workouts, and steps. This is how the coach sees adherence.',
  },
  {
    id: 'plan',
    selector: '[data-tour="nav-plan"]',
    title: 'Plan',
    body: 'The diet and workout your coach wrote. Open a day to see the exact meals and lifts.',
  },
  {
    id: 'chat',
    selector: '[data-tour="nav-chat"]',
    title: 'Chat',
    body: CHAT_AFTER_ENROLLMENT_MESSAGE,
  },
  {
    id: 'journey',
    selector: '[data-tour="nav-journey"]',
    title: 'Journey',
    body: 'Progress photos, check-in history, and how the plan has changed over time.',
  },
]

export function markDemoTourOffer(): void {
  try {
    sessionStorage.setItem(DEMO_TOUR_OFFER_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function consumeDemoTourOffer(): boolean {
  try {
    const hit = sessionStorage.getItem(DEMO_TOUR_OFFER_KEY) === '1'
    if (hit) sessionStorage.removeItem(DEMO_TOUR_OFFER_KEY)
    return hit
  } catch {
    return false
  }
}

export function readDemoTourDone(): boolean {
  try {
    return localStorage.getItem(DEMO_TOUR_STORAGE_KEY) === 'done'
  } catch {
    return false
  }
}

export function markDemoTourDone(): void {
  try {
    localStorage.setItem(DEMO_TOUR_STORAGE_KEY, 'done')
  } catch {
    /* ignore */
  }
}
