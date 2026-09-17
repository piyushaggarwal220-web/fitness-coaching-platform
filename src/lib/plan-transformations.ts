export type PlanTransformation = {
  id: string
  title: string
  subtitle: string
  beforeSrc: string
  afterSrc: string
  beforeAlt: string
  afterAlt: string
}

/** Animated before → after pairs used on Instant Plan + checkout. */
export const PLAN_TRANSFORMATIONS: PlanTransformation[] = [
  {
    id: 'skinny-bulky',
    title: 'Skinny → Bulky',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-man-skinny-before.png',
    afterSrc: '/landing/transformations/tf-man-bulky-after.png',
    beforeAlt: 'Before: skinny build',
    afterAlt: 'After: bulky muscular build',
  },
  {
    id: 'fat-shredded',
    title: 'Fat → Shredded',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-man-fat-before.png',
    afterSrc: '/landing/transformations/tf-man-shredded-after.png',
    beforeAlt: 'Before: higher body fat',
    afterAlt: 'After: shredded lean physique',
  },
  {
    id: 'weak-strong',
    title: 'Weak → Strong',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-man-weak-before.png',
    afterSrc: '/landing/transformations/tf-man-strong-after.png',
    beforeAlt: 'Before: undertrained build',
    afterAlt: 'After: strong athletic build',
  },
  {
    id: 'slim-athletic-w',
    title: 'Slim → Athletic',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-woman-skinny-before.png',
    afterSrc: '/landing/transformations/tf-woman-athletic-after.png',
    beforeAlt: 'Before: slim frame',
    afterAlt: 'After: athletic toned physique',
  },
  {
    id: 'soft-lean-w',
    title: 'Soft → Lean',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-woman-soft-before.png',
    afterSrc: '/landing/transformations/tf-woman-lean-after.png',
    beforeAlt: 'Before: softer midsection',
    afterAlt: 'After: lean toned physique',
  },
  {
    id: 'weak-strong-w',
    title: 'Weak → Strong',
    subtitle: 'Expected change within 30 days',
    beforeSrc: '/landing/transformations/tf-woman-weak-before.png',
    afterSrc: '/landing/transformations/tf-woman-strong-after.png',
    beforeAlt: 'Before: low muscle tone',
    afterAlt: 'After: strong athletic physique',
  },
]
