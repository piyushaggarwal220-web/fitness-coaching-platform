'use client'

import { BRAND_TOP_BAR } from '@/lib/landing/brand-line'
import styles from './SaleEndsTimer.module.css'

type Tone = 'beige' | 'dark' | 'colour'

/** Brand line where the old 60% sale timer used to sit. */
export function SaleEndsTimer({ tone = 'beige' }: { tone?: Tone }) {
  return (
    <div className={`${styles.timer} ${styles[tone]}`} role="status" aria-label={BRAND_TOP_BAR}>
      <p className={styles.line}>{BRAND_TOP_BAR}</p>
    </div>
  )
}
