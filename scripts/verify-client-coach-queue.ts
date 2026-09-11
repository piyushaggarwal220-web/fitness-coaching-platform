import type { WorkQueueTask } from '../src/lib/coach-work-queue'
import {
  buildClientCoachQueueView,
  toClientCoachQueueItems,
} from '../src/lib/client-coach-queue'

let failed = 0

function assert(label: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${label}`)
    failed++
  } else {
    console.log(`PASS ${label}`)
  }
}

function task(
  partial: Pick<WorkQueueTask, 'id' | 'type' | 'clientId' | 'clientName' | 'subtitle'>
): WorkQueueTask {
  return {
    title: partial.clientName ?? 'hidden',
    href: `/coach/secret/${partial.clientId}`,
    priority: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    copyPrompt: 'SECRET_PROMPT',
    coachNextSteps: ['Call Piyush about Rahul'],
    ...partial,
  }
}

const you = 'client-you'
const tasks: WorkQueueTask[] = [
  task({
    id: 'initial-1',
    type: 'initial_plan',
    clientId: 'other-a',
    clientName: 'Rahul Singla',
    subtitle: 'rahul@example.com',
  }),
  task({
    id: 'call-you',
    type: 'call_request',
    clientId: you,
    clientName: 'Asha',
    subtitle: '12 Sep, 11:00 am',
  }),
  task({
    id: 'chat-2',
    type: 'unread_chat',
    clientId: 'other-b',
    clientName: 'Naveen',
    subtitle: 'Hey coach can we skip the call?',
  }),
]

const items = toClientCoachQueueItems(tasks, you)
assert('keeps queue order', items.map((row) => row.position).join(',') === '1,2,3')
assert('marks only this client as yours', items.filter((row) => row.yours).length === 1)
assert('your row is the weekly call', items[1]?.label === 'Your weekly coach call' && items[1]?.yours)
assert(
  'other rows have no names',
  !JSON.stringify(items).includes('Rahul') &&
    !JSON.stringify(items).includes('Naveen') &&
    !JSON.stringify(items).includes('Asha') &&
    !JSON.stringify(items).includes('rahul@') &&
    !JSON.stringify(items).includes('skip the call') &&
    !JSON.stringify(items).includes('SECRET')
)

const view = buildClientCoachQueueView({
  tasks,
  clientId: you,
  planDelivered: true,
})
assert('eligible 12-month view', view.eligible)
assert('your call is #2', view.yourCall?.position === 2 && view.yourCall.aheadCount === 1)
assert('message has no call time', !view.message.includes('11:00') && !view.message.includes('Sep'))
assert('message says coach will call', view.message.includes('will call you this week'))
assert('does not leak other client names', !view.message.includes('Rahul') && !view.items.some((row) => row.label.includes('Rahul')))

const waiting = buildClientCoachQueueView({
  tasks,
  clientId: you,
  withinInitialTwoWeeks: true,
  daysUntilEligible: 4,
  planDelivered: true,
})
assert('hides queue during first 2 weeks', waiting.items.length === 0 && waiting.yourCall === null)

if (failed > 0) {
  console.error(`\n${failed} client coach queue checks failed`)
  process.exit(1)
}
console.log('\nAll client coach queue checks passed')
