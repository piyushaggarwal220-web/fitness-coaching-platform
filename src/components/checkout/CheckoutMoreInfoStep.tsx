'use client'

import type { CSSProperties } from 'react'

type Props = {
 onContinue: () => void
 onBack: () => void
 styles: Record<string, CSSProperties>
 dig: (base: CSSProperties, key?: string) => CSSProperties
}

export function CheckoutMoreInfoStep({ onContinue, onBack, styles, dig }: Props) {
 return (
 <>
 <button type="button" onClick={onBack} style={dig(styles.backToDetails, 'backLink')}>
 {'<- Edit basics'}
 </button>

 <h2
 style={{
 ...dig(styles.title, 'title'),
 fontSize: 26,
 margin: '8px 0 12px',
 }}
 >
 14 more questions. Only after you pay.
 </h2>
 <p style={dig(styles.subtitle, 'subtitle')}>
 Not on this page. Pay first, then the questions, then your plan.
 </p>

 <button type="button" style={{ ...dig(styles.payBtn, 'payBtn'), marginTop: 24 }} onClick={onContinue}>
 Continue to payment
 </button>
 </>
 )
}
