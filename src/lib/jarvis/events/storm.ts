/**
 * Event storm protection — coalesce/defer; never drop P0 representation.
 */

export type StormLimits = {
  events_per_minute: number
  events_per_hour: number
  investigations_per_hour: number
}

export const DEFAULT_STORM_LIMITS: StormLimits = {
  events_per_minute: Number(process.env.JARVIS_EVENTS_PER_MINUTE) || 30,
  events_per_hour: Number(process.env.JARVIS_EVENTS_PER_HOUR) || 200,
  investigations_per_hour: Number(process.env.JARVIS_EVENT_INVESTIGATIONS_PER_HOUR) || 20,
}

export function shouldStormDefer(input: {
  eventsLastMinute: number
  eventsLastHour: number
  investigationsLastHour: number
  priority: string
  limits?: StormLimits
}): { defer: boolean; reason: string | null } {
  const limits = input.limits || DEFAULT_STORM_LIMITS
  if (input.priority === 'P0') {
    return { defer: false, reason: null }
  }
  if (input.eventsLastMinute >= limits.events_per_minute) {
    return { defer: true, reason: 'events_per_minute_exceeded' }
  }
  if (input.eventsLastHour >= limits.events_per_hour) {
    return { defer: true, reason: 'events_per_hour_exceeded' }
  }
  if (input.investigationsLastHour >= limits.investigations_per_hour) {
    return { defer: true, reason: 'investigations_per_hour_exceeded' }
  }
  return { defer: false, reason: null }
}
