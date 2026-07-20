/** All LURVOX landing page copy — swap real names/results when photos are ready. */

export const site = {
  brand: 'LURVOX',
  whatsappUrl: 'https://wa.me/919220451577',
  whatsappDisplay: '+91 92204 51577',
  checkoutBase: '/checkout',
} as const

export const nav = {
  cta: 'Start Today',
  pricing: 'See Pricing',
} as const

export const hero = {
  headline: 'Stop Guessing. Get Coaching That Actually Works.',
  subheadline:
    'Personal workout plans, real diet coaching, weekly reviews, and daily tracking — from coaches who adjust your plan based on your progress, not a PDF.',
  primaryCta: 'Start My Transformation',
  secondaryCta: 'See Plans & Pricing',
  proofStripLabel: 'Real client results',
  coachPhotoAlt: 'LURVOX coach',
  /** Put file in public/landing/coach.jpg then set: '/landing/coach.jpg' */
  coachPhoto: '',
  finalCtaImage: '',
} as const

export const heroTransforms = [
  {
    name: 'Rahul M.',
    result: '−11 kg · 14 weeks',
    /** e.g. '/landing/hero/rahul.jpg' */
    image: '',
  },
  {
    name: 'Priya S.',
    result: '−8 kg · 10 weeks',
    image: '',
  },
  {
    name: 'Aman K.',
    result: '−14 kg · 16 weeks',
    image: '',
  },
] as const

export const socialProof = {
  eyebrow: 'Proof, not promises',
  headline: 'Real Transformations. Real People.',
  subheadline:
    'These are clients who followed their personalized plans and stayed consistent with weekly coaching.',
  cta: 'I Want Results Like These',
} as const

/**
 * Transformation cards — drop images in public/landing/transforms/
 * then set before/after paths like '/landing/transforms/rahul-before.jpg'
 */
export const transformations = [
  {
    id: 't1',
    name: 'Rahul M.',
    time: '14 weeks',
    weightLost: '11 kg',
    bodyFatLost: '7%',
    quote: 'Weekly check-ins stopped me from quitting when I stalled.',
    before: '',
    after: '',
  },
  {
    id: 't2',
    name: 'Priya S.',
    time: '10 weeks',
    weightLost: '8 kg',
    bodyFatLost: '5%',
    quote: 'My coach rebuilt my diet around night shifts. That changed everything.',
    before: '',
    after: '',
  },
  {
    id: 't3',
    name: 'Aman K.',
    time: '16 weeks',
    weightLost: '14 kg',
    bodyFatLost: '9%',
    quote: 'Not another generic plan. Someone actually looked at my photos every week.',
    before: '',
    after: '',
  },
  {
    id: 't4',
    name: 'Sneha R.',
    time: '12 weeks',
    weightLost: '9 kg',
    bodyFatLost: '6%',
    quote: 'Home workouts only. Still got visible results by week 6.',
    before: '',
    after: '',
  },
  {
    id: 't5',
    name: 'Vikram T.',
    time: '20 weeks',
    weightLost: '16 kg',
    bodyFatLost: '10%',
    quote: 'Cheapest coaching I have tried that still feels like a real coach.',
    before: '',
    after: '',
  },
  {
    id: 't6',
    name: 'Meera J.',
    time: '8 weeks',
    weightLost: '6 kg',
    bodyFatLost: '4%',
    quote: 'They asked about my kids and schedule before building anything.',
    before: '',
    after: '',
  },
  {
    id: 't7',
    name: 'Arjun P.',
    time: '18 weeks',
    weightLost: '12 kg',
    bodyFatLost: '8%',
    quote: 'Plan updates after every check-in kept progress moving.',
    before: '',
    after: '',
  },
  {
    id: 't8',
    name: 'Divya N.',
    time: '11 weeks',
    weightLost: '7 kg',
    bodyFatLost: '5%',
    quote: 'Vegetarian diet, beginner workouts — and I still hit my goal.',
    before: '',
    after: '',
  },
] as const

export const whyPeopleFail = {
  eyebrow: 'Why most people quit',
  headline: 'It Is Not Willpower. It Is the System.',
  subheadline: 'Most fitness journeys fail for the same three reasons.',
  cards: [
    {
      title: 'Generic Plans',
      body: 'A random PDF does not know your schedule, equipment, injuries, or food preferences. You follow it until life gets in the way — then you stop.',
    },
    {
      title: 'No Accountability',
      body: 'Without weekly check-ins and a coach watching your progress, small slips become permanent. Motivation alone does not last.',
    },
    {
      title: 'No Tracking',
      body: 'If you are not tracking workouts, diet, sleep, and habits, you cannot fix what is broken. Guessing is why progress stalls.',
    },
  ],
  cta: 'Get a System That Works',
} as const

export const howItWorks = {
  eyebrow: 'The LURVOX method',
  headline: 'Why LURVOX Works',
  subheadline: 'A clear path from day one to visible change.',
  steps: [
    { title: 'Assessment', body: 'We learn your goals, schedule, diet, and starting point.' },
    { title: 'Personal Plan', body: 'Custom workout + diet built for your life — not a template.' },
    { title: 'Weekly Coaching', body: 'Real coach reviews. Real adjustments. No chatbot.' },
    { title: 'Daily Tracking', body: 'Log workouts, food, water, sleep, steps, and more.' },
    { title: 'Weekly Updates', body: 'Your plan changes based on what is actually happening.' },
    { title: 'Transformation', body: 'Measurable progress you can see and feel.' },
  ],
  cta: 'Start the Process',
} as const

export const insideCoaching = {
  eyebrow: 'Your client app',
  headline: 'Inside Your Coaching',
  subheadline: 'Everything you need in one place — built so your coach can guide you better.',
  features: [
    {
      title: 'Workout',
      body: 'Your personal training sessions with clear exercises, sets, and progressions.',
      image: '',
    },
    {
      title: 'Diet',
      body: 'Meals and macros built around your preferences, allergies, and schedule.',
      image: '',
    },
    {
      title: 'Tracker',
      body: 'Daily logging for workout, diet, water, sleep, steps, and supplements.',
      image: '',
    },
    {
      title: 'Coach Chat',
      body: 'Message your coach directly when you need clarity or support.',
      image: '',
    },
    {
      title: 'Progress',
      body: 'Weight, measurements, and adherence in one view your coach actually reviews.',
      image: '',
    },
    {
      title: 'Journey',
      body: 'Your timeline of check-ins, plan updates, and wins — all in one place.',
      image: '',
    },
    {
      title: 'Photos',
      body: 'Progress photos compared over time so changes are impossible to miss.',
      image: '',
    },
  ],
  cta: 'Get Full Access',
} as const

export const whatYouGet = {
  eyebrow: 'Everything included',
  headline: 'What You Get',
  subheadline: 'No upsells. No hidden fees. One price covers coaching end to end.',
  items: [
    { title: 'Personal Workout Plan', body: 'Built for your goal, level, and equipment.' },
    { title: 'Personal Diet', body: 'Custom nutrition — veg, non-veg, allergies included.' },
    { title: 'Weekly Check-ins', body: 'Structured reviews so nothing slips through.' },
    { title: 'Habit Tracking', body: 'Build consistency with habits that stick.' },
    { title: 'Workout Tracker', body: 'Log sets, reps, and adherence daily.' },
    { title: 'Diet Tracker', body: 'Stay on your meal plan without guessing.' },
    { title: 'Water Tracker', body: 'Hit hydration targets every day.' },
    { title: 'Sleep Tracker', body: 'Recovery that actually supports progress.' },
    { title: 'Step Tracker', body: 'Daily movement targets that fit your life.' },
    { title: 'Supplement Tracker', body: 'Log what your coach recommends.' },
    { title: 'Coach Chat', body: 'Direct support when you need it.' },
    { title: 'Progress Photos', body: 'Visual proof of change over time.' },
    { title: 'Journey', body: 'Your full coaching history in one timeline.' },
    { title: 'Plan Updates', body: 'Weekly tweaks based on real data.' },
  ],
  cta: 'Claim Full Access',
} as const

export const pricing = {
  eyebrow: 'Simple pricing',
  headline: 'Choose Your Plan',
  subheadline:
    'Same coaching on every plan. Longer plans cost less per month — and every higher package includes everything below.',
  comparisonNote: 'Every higher package includes everything in the plans below it.',
  featuresIncluded: [
    'Personal workout plan',
    'Personal diet plan',
    'Weekly coach check-ins',
    'Daily habit & health trackers',
    'Coach chat support',
    'Progress photos & journey',
    'Weekly plan updates',
  ],
  plans: [
    {
      slug: '1_month',
      name: '1 Month',
      price: '₹499',
      perMonth: '₹499/month',
      blurb: 'Perfect to get started',
      save: null,
      popular: false,
    },
    {
      slug: '3_months',
      name: '3 Months',
      price: '₹999',
      perMonth: '≈ ₹333/month',
      blurb: 'Best balance of price and consistency',
      save: 'SAVE ₹498',
      popular: true,
    },
    {
      slug: '6_months',
      name: '6 Months',
      price: '₹1699',
      perMonth: '≈ ₹283/month',
      blurb: 'Serious results need serious time',
      save: 'SAVE ₹1295',
      popular: false,
    },
    {
      slug: '12_months',
      name: '12 Months',
      price: '₹2999',
      perMonth: '≈ ₹250/month',
      blurb: 'Lowest monthly cost. Maximum support.',
      save: 'SAVE ₹2989',
      popular: false,
    },
  ],
  cta: 'Start Today',
} as const

export const affordability = {
  headline: 'Why Are We So Affordable?',
  body: [
    'Our coaches use AI-assisted tools behind the scenes to automate repetitive work such as plan generation and progress analysis.',
    'That means coaches spend more time helping clients instead of doing paperwork.',
    'The result is premium coaching at a fraction of the traditional cost.',
  ],
  reassurance:
    'You still receive personalized coaching, weekly reviews, customized plans, and direct support.',
} as const

export const guarantee = {
  headline: 'Visible Results Within 2 Months.',
  subheadline:
    'If you consistently follow your personalized plan and weekly coaching, we are confident you will see measurable progress within the first two months — better energy, better adherence, and clear physical change.',
  note: 'Results depend on consistency. We do not promise overnight miracles. We promise a coaching system that works when you work it.',
  cta: 'Start With Confidence',
} as const

export const faq = {
  eyebrow: 'Questions',
  headline: 'FAQ',
  items: [
    {
      q: 'Why so cheap?',
      a: 'Traditional coaching prices include hours of admin work. Our coaches use advanced tools and automation to cut repetitive work — so they can coach more people without charging luxury-studio rates. You still get a real coach, personalized plans, and weekly reviews.',
    },
    {
      q: 'Will I get a real coach?',
      a: 'Yes. A human coach reviews your plan, check-ins, and progress. Technology helps them work faster — it does not replace them.',
    },
    {
      q: 'Do I need a gym?',
      a: 'No. We build plans for gym, home, or a mix — based on what you actually have access to.',
    },
    {
      q: 'Can vegetarians join?',
      a: 'Absolutely. Diet plans are built around your preferences, including vegetarian, vegan, and allergy restrictions.',
    },
    {
      q: 'Can beginners join?',
      a: 'Yes. Beginners are welcome. Your plan matches your experience level and progresses safely.',
    },
    {
      q: 'What if I miss workouts?',
      a: 'Tell your coach on the next check-in. Plans get adjusted for real life — travel, busy weeks, and missed sessions happen. Consistency over perfection.',
    },
    {
      q: 'Can I cancel?',
      a: 'Yes. Message us on WhatsApp and we will process it — no pressure games.',
    },
    {
      q: 'How quickly will I see results?',
      a: 'Most clients who follow their plan consistently notice measurable progress within the first two months. Exact timelines vary by starting point, adherence, and goals.',
    },
  ],
  cta: 'Still Have Questions? Message Us',
} as const

export const finalCta = {
  headline: 'Your Transformation Starts With One Decision.',
  subheadline:
    'Personal coaching. Unreal pricing. Real accountability. Get in now — and stop doing this alone.',
  cta: 'Get My Transformation Started',
} as const

export const stickyCta = {
  label: 'Start Today — From ₹499',
  mobileLabel: 'Start Today',
} as const

export const footer = {
  tagline: 'Personal coaching that actually transforms.',
  legal: 'Results vary by individual, consistency, and starting point.',
  payments: 'Secure payments via Razorpay · Cancel anytime',
  copyright: `© ${new Date().getFullYear()} LURVOX. All rights reserved.`,
} as const
