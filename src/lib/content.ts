/** Public landing copy. Prices and durations come from the coaching catalog, not this file. */

export const site = {
  brand: 'LURVOX',
  whatsappUrl: 'https://wa.me/919220451577',
  whatsappDisplay: '+91 92204 51577',
  checkoutBase: '/checkout',
} as const

export const nav = {
  cta: 'Start for ₹599',
  pricing: 'View plans',
} as const

export const hero = {
  kicker: 'Online fitness coaching',
  headline: 'Build your best physique.',
  subheadline: 'Personalized coaching built around your body, goals and lifestyle.',
  priceLabel: 'Starting from',
  duration: '90 days',
  primaryCta: 'Start for ₹599',
  secondaryCta: 'View plans',
  coachPhotoAlt: 'LURVOX coaches Piyush Aggarwal and Rakshit Mohla',
} as const

/** No live, phone, or WhatsApp calls. Issues go to the two coaches on Instagram. */
export const COACH_ISSUE_CONTACT =
  'We do not do live calls. If you have an issue, message Coach Piyush (@maximusvault) or Coach Rakshit (@rakshitmohla_) on Instagram.'

export const coaches = [
  {
    name: 'Piyush Aggarwal',
    firstName: 'Piyush',
    photo: '/landing/instant-coach-piyush.png',
    instagramHandle: '@maximusvault',
    instagramUrl: 'https://www.instagram.com/maximusvault/',
  },
  {
    name: 'Rakshit Mohla',
    firstName: 'Rakshit',
    photo: '/landing/instant-coach-rakshit.png',
    instagramHandle: '@rakshitmohla_',
    instagramUrl: 'https://www.instagram.com/rakshitmohla_/',
  },
] as const

export const goals = {
  eyebrow: 'Choose a direction',
  headline: 'Three goals. One coaching system.',
  items: [
    {
      id: 'fat-loss',
      title: 'Fat loss',
      audience: 'For a focused 90-day cut',
      timeframe: '3 months',
      image: '/images/lurvox/goals/goal-fat-loss.webp',
      alt: 'Woman training at home in a quiet morning interior',
      plan: '3_months',
    },
    {
      id: 'muscle-gain',
      title: 'Muscle gain',
      audience: 'For losing fat while building muscle',
      timeframe: '6 months',
      image: '/images/lurvox/goals/goal-muscle-gain.webp',
      alt: 'Man performing a dumbbell row in a dark gym',
      plan: '6_months',
    },
    {
      id: 'athletic',
      title: 'Athletic body',
      audience: 'For fat loss, muscle, and stamina',
      timeframe: '12 months',
      image: '/images/lurvox/goals/goal-athletic.webp',
      alt: 'Woman on an outdoor path at dusk',
      plan: '12_months',
    },
  ],
} as const

export const system = {
  eyebrow: 'The LURVOX system',
  headline: 'A plan that changes with you.',
  lead: 'Technology builds the structure. Your coach uses it to guide the work.',
  items: [
    { title: 'Personalized workout', body: 'Sessions for your goal, level, and equipment — gym, home, or both.' },
    { title: 'Personalized diet', body: 'Meals around your food, schedule, and preferences.' },
    { title: 'Sleep and recovery', body: 'Sleep, steps, and habits logged beside training.' },
    { title: 'Daily tracking', body: 'Workout, meals, water, and supplements in one day.' },
    { title: 'Coach check-ins', body: 'Mid-week and weekly reviews on every plan.' },
    { title: 'Coach chat', body: 'Message your coach in the app when you need a decision.' },
    { title: 'Exercise form', body: 'Form videos in the app so the movement is clear.' },
    { title: 'Plan updates', body: 'Every 14 days on 3 months. Every week on 6 and 12 months.' },
  ],
} as const

export const coaching = {
  eyebrow: 'Human coaching',
  headline: 'Your coach guides the journey.',
  lead: 'Piyush and Rakshit review your case in the app. There are no live calls.',
  note: COACH_ISSUE_CONTACT,
} as const

export const appExperience = {
  eyebrow: 'The app',
  headline: 'What you open each day.',
  lead: 'The same coaching, on your phone. Open today, do the work, talk to your coach.',
  items: [
    { title: 'Today', body: 'Workout, meals, and trackers for the day in front of you.' },
    { title: 'Plan', body: 'The workout and diet your coach delivered.' },
    { title: 'Track', body: 'Log a session, a meal, water, sleep, or steps and leave.' },
    { title: 'Check-in', body: 'Submit the weekly review, including photos when they are due.' },
    { title: 'Coach', body: 'Read the reply, see who sent it, and know the next step.' },
    { title: 'Journey', body: 'Where you started, the current phase, and what comes next.' },
  ],
} as const

export const pillars = {
  training: {
    eyebrow: 'Training',
    headline: 'Strength, then conditioning.',
    body: 'Clear sessions. Sets, reps, rest, and a way to mark the work done.',
    image: '/images/lurvox/editorial/training-strength.webp',
    alt: 'Man setting up a barbell in a dark studio gym',
  },
  nutrition: {
    eyebrow: 'Nutrition',
    headline: 'Meals you can repeat.',
    body: 'A structure for the week — food, quantity, and room to stay consistent.',
    image: '/images/lurvox/editorial/nutrition-editorial.webp',
    alt: 'A simple high-protein meal on a dark table',
  },
  recovery: {
    eyebrow: 'Recovery',
    headline: 'Rest is part of the plan.',
    body: 'Sleep, walking, and days that are not spent in the gym.',
    image: '/images/lurvox/editorial/recovery-editorial.webp',
    alt: 'Woman resting at home in low light',
  },
} as const

export const pricing = {
  eyebrow: 'Plans',
  headline: 'Premium coaching. A clear starting price.',
  subheadline: 'Same core coaching on every plan. Longer plans cost less per month.',
  features: [
    'Personal workout and diet',
    'Mid-week and weekly check-ins',
    'Daily trackers',
    'Coach chat',
    'Progress photos and journey',
    'Plan updates every 14 days on 3 months, every week on 6 and 12 months',
  ],
  cta: 'Start for ₹599',
} as const

export const faq = {
  eyebrow: 'Questions',
  headline: 'Before you start',
  items: [
    {
      q: 'What is LURVOX?',
      a: 'Online fitness coaching. You get a personal workout, a personal diet, check-ins, and coach chat in the app.',
    },
    {
      q: 'What does ₹599 include?',
      a: 'The 3-month Fat loss plan: personal workout and diet, mid-week and weekly check-ins, daily trackers, coach chat, and plan updates every 14 days.',
    },
    {
      q: 'Do I need a gym?',
      a: 'No. Plans are built for a gym, home, or a mix, based on what you can actually use.',
    },
    {
      q: 'Can beginners and vegetarians join?',
      a: 'Yes. Training matches your experience. Diet follows your food preferences, including vegetarian meals and allergies.',
    },
    {
      q: 'How do I reach a coach?',
      a: 'Inside the app. LURVOX does not do live calls. For an issue, message Coach Piyush (@maximusvault) or Coach Rakshit (@rakshitmohla_) on Instagram.',
    },
    {
      q: 'Are results guaranteed?',
      a: 'No. Progress depends on your starting point and how consistently you follow the plan. Refund and cancellation rules are only in the Terms.',
    },
  ],
} as const

export const finalCta = {
  headline: 'Start the 90 days.',
  subheadline: 'Online coaching, a personal plan, and a price you can see before you scroll.',
  cta: 'Start for ₹599',
} as const

export const stickyCta = {
  label: 'Start for ₹599',
  mobileLabel: 'Start for ₹599',
} as const

export const footer = {
  tagline: 'Online fitness coaching.',
  legal: 'Results vary. LURVOX does not promise a specific change in weight or time.',
  payments: 'Secure payments via Razorpay',
  copyright: `© ${new Date().getFullYear()} LURVOX. All rights reserved.`,
} as const
