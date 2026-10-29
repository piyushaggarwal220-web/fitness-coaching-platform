import assert from 'node:assert/strict'
import {
  coachAskedToApply,
  crosscheckPlannerSections,
  estimateTokens,
  formatPlannerCheckinBrief,
  formatPlannerMidWeekBrief,
  labeledDayCount,
  meaningfulConstraint,
  parseConstraintFailures,
  parsePlannerDecision,
  plannerModelWindow,
  plannerSectionsToScope,
  summaryTimestamp,
  type PlannerContextMessage,
} from '../src/lib/ai/client-planner-pure'

assert.equal(estimateTokens(''), 0)
assert.equal(estimateTokens('abcd'), 1)
assert.equal(estimateTokens('a'.repeat(400)), 100)

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const diet = days.map((day, index) => `Day ${index + 1} (${day})\nOats and dal`).join('\n')
const workout = days.slice(0, 4).map((day, index) => `Day ${index + 1} (${day})\nSquat`).join('\n')
assert.equal(labeledDayCount(diet), 7)
assert.equal(labeledDayCount(workout), 4)
assert.deepEqual(
  crosscheckPlannerSections({
    nutrition: diet,
    workout,
    cardio: '8,000 steps',
    supplements: 'Creatine',
    previousWorkoutDays: 4,
    changed: ['nutrition', 'workout', 'cardio', 'supplements'],
    instruction: 'Higher protein and keep four training days',
  }),
  []
)
assert.match(
  crosscheckPlannerSections({
    nutrition: 'Day 1 (Monday)\nOats',
    workout: '',
    cardio: '',
    supplements: '',
    previousWorkoutDays: 4,
    changed: ['nutrition'],
    instruction: 'Change Monday only',
  }).join(' '),
  /7 days/
)

const decision = parsePlannerDecision(
  'I will drop dairy.\n<<<PLANNER\n{"update":{"sections":["nutrition","workout"],"instruction":"Remove dairy and seated rows","clientNote":"Dairy is out of the diet."},"closeRequest":false}\n>>>'
)
assert.equal(decision.update?.sections.join(','), 'nutrition,workout')
assert.match(decision.update?.instruction ?? '', /seated rows/)
assert.equal(decision.reply.includes('<<<PLANNER'), false)
assert.equal(parsePlannerDecision('Still deciding on the split.').update, null)

assert.equal(coachAskedToApply('What if we change the diet?'), false)
assert.equal(coachAskedToApply('Should we raise protein?'), false)
assert.equal(plannerSectionsToScope(['nutrition', 'sleep']), 'diet')
assert.equal(plannerSectionsToScope(['workout', 'cardio']), 'workout')
assert.equal(plannerSectionsToScope(['nutrition', 'workout']), 'both')
assert.equal(coachAskedToApply('Apply that.'), true)
assert.equal(coachAskedToApply('Change the diet to vegetarian.'), true)
assert.equal(meaningfulConstraint('none'), '')
assert.equal(meaningfulConstraint('bad knee'), 'bad knee')
assert.deepEqual(parseConstraintFailures('PASS'), [])
assert.deepEqual(parseConstraintFailures(''), ['The plan check did not return a result.'])
assert.match(parseConstraintFailures('- Diet includes milk.\n- Squat loads the knee.')[0] ?? '', /milk/)
assert.match(formatPlannerCheckinBrief({
  checkinId: 'abc',
  coachingWeek: 4,
  weight: 80,
  dietAdherence: 7,
  workoutAdherence: null,
  energyLevel: null,
  sleepQuality: null,
  stressLevel: null,
  painInjuries: 'knee',
  questions: null,
}), /Weekly check-in abc/)
assert.match(
  formatPlannerMidWeekBrief({
    checkinId: 'mid-1',
    coachingWeek: 4,
    dietAdherence: 6,
    workoutAdherence: 7,
    energyLevel: 5,
    sleepQuality: 6,
    stressLevel: 4,
    wins: 'Hit protein',
    struggles: 'Late dinners',
    painInjuries: null,
    questions: 'Drop rice?',
  }),
  /Mid-week check-in mid-1/
)
assert.match(
  crosscheckPlannerSections({
    nutrition: diet,
    workout,
    cardio: 'Zone 2 for 20 minutes',
    supplements: 'Creatine',
    previousWorkoutDays: 4,
    changed: ['cardio'],
    instruction: 'Add easy cardio',
  }).join(' '),
  /step count/
)

function message(index: number, role: PlannerContextMessage['role'] = 'coach'): PlannerContextMessage {
  return {
    role,
    content: 'x'.repeat(400),
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }
}

const fitting = [message(0), message(1)]
assert.equal(plannerModelWindow(fitting, 250), null)

const overflowing = [message(0), message(1), message(2), message(3), message(4, 'assistant')]
const window = plannerModelWindow(overflowing, 250)
assert.ok(window)
assert.ok(window.fold.length > 0)
assert.ok(window.keep.length > 0)
assert.equal(window.fold.length + window.keep.length, overflowing.length)
assert.equal(window.keep[window.keep.length - 1]?.role, 'assistant')
assert.ok(estimateTokens(window.keep.map((row) => row.content).join('')) <= 250 || window.keep.length === 1)

const stamped = summaryTimestamp(window.keep[0]!.created_at)
assert.ok(Date.parse(stamped) < Date.parse(window.keep[0]!.created_at))

const withSummary: PlannerContextMessage[] = [
  { role: 'summary', content: 'Earlier in this chat\n\nProtein went up.', created_at: '2026-01-01T00:00:00.000Z' },
  message(1),
]
assert.equal(plannerModelWindow(withSummary, 500), null)

console.log('verify-client-planner: ok')
