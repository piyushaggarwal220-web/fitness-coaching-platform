/**
 * Answers about the coaching intake app. Diet advice stays with the plan.
 */

export type IntakeHelpInput = {
  message: string
  section: string
  step: number
  blockedReason?: string | null
}

export type IntakeHelpReply = {
  text: string
  offerSend: boolean
}

export const INTAKE_HELP_STARTERS = [
  'I can’t continue',
  'Photo won’t upload',
  'My city or food is missing',
  'Send this to the team',
] as const

export function intakeHelpGreeting(section: string): string {
  return `I help with the intake app: a step that will not continue, photos, cities and foods, or sign-in. You are on ${section}. Your coach still writes the diet and workout after you finish.`
}

export function replyToIntakeHelp(input: IntakeHelpInput): IntakeHelpReply {
  const text = input.message.trim().toLowerCase()
  const blocked = input.blockedReason?.trim()

  if (!text) {
    return {
      text: 'Tell me what the screen is doing. If Continue is blocked, the reason is in red on this step.',
      offerSend: false,
    }
  }

  if (/\b(human|person|someone|team|agent|real coach|send this|talk to)\b/.test(text)) {
    return {
      text: 'I can send this chat to the team. They see it as an app support request. It does not change your diet answers.',
      offerSend: true,
    }
  }

  if (/\b(photo|camera|upload|picture|image)\b/.test(text)) {
    return {
      text: 'Front, side, and back photos are required, except female clients can skip them. Wait until the slot says Uploaded before Continue. If the camera closes the page, sign in again — saved answers stay. A photo that fails shows an error under that slot.',
      offerSend: true,
    }
  }

  if (/\b(city|cities|town|village|food|plate|makki)\b/.test(text)) {
    return {
      text: 'On What you eat now, type the city and pick it from the list. About 1,200 cities are there. If yours is missing, type the name and pick the closest region. Untick foods you do not eat. Under “Add a food that is not on this list”, type anything else and tap Add. You need at least 3 foods, then the usual breakfast and lunch amounts. A vegetarian or vegan diet hides foods that do not fit it.',
      offerSend: false,
    }
  }

  if (/\b(sign[\s-]?in|log[\s-]?in|logged out|signed out|password)\b/.test(text)) {
    return {
      text: 'If the page says sign in to keep going, your session dropped. Answers already saved stay on the account. Use Sign in, then you return to this intake. The same email you used at checkout is the account.',
      offerSend: true,
    }
  }

  if (/\b(pay|payment|checkout|purchase|bought|refund)\b/.test(text)) {
    return {
      text: 'Intake opens after the purchase is on the account. If you paid and still cannot get in, sign in with the checkout email. I can send the payment problem to the team — they can see the order. I cannot change a charge from this chat.',
      offerSend: true,
    }
  }

  if (/\b(save|saved|progress|back|leave|later)\b/.test(text)) {
    return {
      text: 'Continue saves the step you just finished. Back is at the bottom and does not erase earlier answers. You can close the page and return later on the same account.',
      offerSend: false,
    }
  }

  if (/\b(what should i eat|fat loss|calories?|meal plan|diet plan)\b/.test(text)) {
    return {
      text: 'This chat is for problems with the intake app. The diet plan is written after you finish intake.',
      offerSend: false,
    }
  }

  if (/\b(plan|workout|diet chart|how long|after|finish|submit)\b/.test(text)) {
    return {
      text: 'Finish every required step, then Complete intake. The diet and workout show up in My Plan. This chat only helps you get through the form.',
      offerSend: false,
    }
  }

  if (/\b(continue|stuck|error|won’t|wont|cannot|can’t|cant|blocked|red)\b/.test(text)) {
    if (blocked) {
      return {
        text: `Continue is waiting on this: ${blocked} Fix that on the current step, then press Continue again.`,
        offerSend: true,
      }
    }
    return {
      text: `Continue stays on ${input.section} until the required answer on this step is filled. The missing piece appears in red under the question. Back moves to the previous step.`,
      offerSend: true,
    }
  }

  return {
    text: blocked
      ? `I can help with the app, not the coaching plan. Right now Continue says: ${blocked}`
      : `I can help with Continue, photos, the city and food list, saving, and sign-in. You are on ${input.section}. Tell me what the screen is doing, or send this to the team.`,
    offerSend: true,
  }
}

export function intakeHelpTranscript(lines: { from: 'you' | 'help'; text: string }[], extra?: string | null): string {
  const chat = lines
    .map((line) => `${line.from === 'you' ? 'Client' : 'Help'}: ${line.text}`)
    .join('\n')
  const reason = extra?.trim() ? `\n\nScreen message: ${extra.trim()}` : ''
  return `${chat}${reason}`.slice(0, 4000)
}
