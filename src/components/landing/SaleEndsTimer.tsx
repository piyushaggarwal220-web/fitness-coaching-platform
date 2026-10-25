'use client'

import { useEffect, useState } from 'react'
import { formatCountdownHms } from '@/lib/sale-countdown'
import { previewSaleRemainingMs } from '@/lib/preview-sale-timer'
import { usePreviewSale } from './PreviewSaleCode'
import styles from './SaleEndsTimer.module.css'

type Tone = 'beige' | 'dark' | 'colour'

function clockParts(label: string) {
  const [hours = '05', minutes = '00', seconds = '00'] = label.split(':')
  return { hours, minutes, seconds }
}

/** Visual urgency only. Does not change plan prices. */
export function SaleEndsTimer({ tone = 'beige' }: { tone?: Tone }) {
  const [label, setLabel] = useState('05:00:00')

  useEffect(() => {
    const tick = () => setLabel(formatCountdownHms(previewSaleRemainingMs()))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const { hours, minutes, seconds } = clockParts(label)
  const sale = usePreviewSale()

  return (
    <div className={`${styles.timer} ${styles[tone]}`} role="status" aria-label={`60% off. Sale ends in ${label}. Code ${sale.code}`}>
      <div className={styles.offer}>
        <span className={styles.pct}>60%</span>
        <span className={styles.off}>off</span>
      </div>
      <div className={styles.ends}>
        <span className={styles.copy}>Sale ends in</span>
        <strong className={styles.time}>
          <span>{hours}</span>
          <span className={styles.sep} aria-hidden="true">:</span>
          <span>{minutes}</span>
          <span className={styles.sep} aria-hidden="true">:</span>
          <span>{seconds}</span>
        </strong>
      </div>
      <div className={styles.codeRow}>
        <span className={styles.codeLabel}>Code</span>
        <strong className={styles.code}>{sale.code}</strong>
        <button type="button" className={styles.apply} onClick={sale.apply} disabled={sale.applied}>
          {sale.applied ? 'Applied' : 'Apply'}
        </button>
      </div>
    </div>
  )
}
