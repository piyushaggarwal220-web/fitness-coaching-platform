import type { WorkQueueTask, WorkQueueTaskType } from '@/lib/coach-work-queue'

export type ClientCoachQueueItem = {
  position: number
  type: WorkQueueTaskType
  label: string
  yours: boolean
}

export type ClientCoachQueueYourCall = {
  position: number
  total: number
  aheadCount: number
}

export type ClientCoachQueueView = {
  eligible: boolean
  withinInitialTwoWeeks: boolean
  daysUntilEligible: number | null
  planDelivered: boolean
  items: ClientCoachQueueItem[]
  yourCall: ClientCoachQueueYourCall | null
  message: string
}

const OTHER_TASK_LABEL: Record<WorkQueueTaskType, string> = {
  initial_plan: 'Preparing a new client plan',
  journey_setup: 'Preparing a new client plan',
  plan_change_request: 'Reviewing a plan edit',
  checkin_review: 'Reviewing a check-in',
  call_request: 'Weekly coach call',
  unread_chat: 'Replying to a message',
  issue_report: 'Looking at a support issue',
  league_certificate: 'Sending a league certificate',
  other: 'Other coaching work',
}

const YOUR_TASK_LABEL: Record<WorkQueueTaskType, string> = {
  initial_plan: 'Your first plan',
  journey_setup: 'Your first plan',
  plan_change_request: 'Your plan edit',
  checkin_review: 'Your check-in',
  call_request: 'Your weekly coach call',
  unread_chat: 'Your message',
  issue_report: 'Your support issue',
  league_certificate: 'Your league certificate',
  other: 'Your coaching task',
}

function labelForTask(task: WorkQueueTask, yours: boolean): string {
  return yours ? YOUR_TASK_LABEL[task.type] : OTHER_TASK_LABEL[task.type]
}

/** Strip names, chat previews, and other client PII from the coach work queue. */
export function toClientCoachQueueItems(
  tasks: WorkQueueTask[],
  clientId: string
): ClientCoachQueueItem[] {
  return tasks.map((task, index) => {
    const yours = task.clientId === clientId
    return {
      position: index + 1,
      type: task.type,
      label: labelForTask(task, yours),
      yours,
    }
  })
}

export function findYourCallInQueue(
  tasks: WorkQueueTask[],
  clientId: string
): ClientCoachQueueYourCall | null {
  const index = tasks.findIndex(
    (task) => task.type === 'call_request' && task.clientId === clientId
  )
  if (index < 0) return null
  return {
    position: index + 1,
    total: tasks.length,
    aheadCount: index,
  }
}

export function buildClientCoachQueueView(input: {
  tasks: WorkQueueTask[]
  clientId: string
  withinInitialTwoWeeks?: boolean
  daysUntilEligible?: number | null
  planDelivered?: boolean
}): ClientCoachQueueView {
  const items = toClientCoachQueueItems(input.tasks, input.clientId)
  const yourCall = findYourCallInQueue(input.tasks, input.clientId)

  if (input.withinInitialTwoWeeks) {
    const days = input.daysUntilEligible ?? 0
    return {
      eligible: true,
      withinInitialTwoWeeks: true,
      daysUntilEligible: days,
      planDelivered: input.planDelivered ?? true,
      items: [],
      yourCall: null,
      message:
        days > 0
          ? `Weekly calls open when your plan is ready (${days} day${days === 1 ? '' : 's'} left).`
          : 'Your weekly call opens as soon as your plan is delivered.',
    }
  }

  if (!input.planDelivered) {
    return {
      eligible: true,
      withinInitialTwoWeeks: false,
      daysUntilEligible: null,
      planDelivered: false,
      items: [],
      yourCall: null,
      message: 'Your weekly coach call is booked automatically after your first plan is delivered.',
    }
  }

  if (yourCall) {
    const place =
      yourCall.aheadCount === 0
        ? 'You are next in your coach’s work queue.'
        : `You are #${yourCall.position} of ${yourCall.total} in your coach’s work queue.`
    return {
      eligible: true,
      withinInitialTwoWeeks: false,
      daysUntilEligible: null,
      planDelivered: true,
      items,
      yourCall,
      message: `${place} Your coach will call you this week — you do not pick a time.`,
    }
  }

  return {
    eligible: true,
    withinInitialTwoWeeks: false,
    daysUntilEligible: null,
    planDelivered: true,
    items,
    yourCall: null,
    message:
      items.length > 0
        ? 'Your coach’s current work queue is below. Your weekly call is booked automatically when it is due.'
        : 'Your weekly call is booked automatically. Your coach’s queue is clear right now.',
  }
}
