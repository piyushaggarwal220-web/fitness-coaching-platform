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

 <p style={dig(styles.sectionLabel, 'sectionLabel')}>NEXT STEP</p>
 <h2
 style={{
 ...dig(styles.title, 'title'),
 fontSize: 26,
 margin: '0 0 12px',
 }}
 >
 We need more about you to create your plan
 </h2>
 <p style={dig(styles.subtitle, 'subtitle')}>
 Basics are a start. After checkout we ask about your lifestyle, training, diet details, and
 photos - then your customized diet, workout, cardio, and sleep guidance is built on the
 platform.
 </p>

 <ul style={{ ...styles.todoList, margin: '20px 0 28px' }}>
 <li>More questions after you unlock</li>
 <li>Plan delivered on the platform</li>
 <li>Not a random PDF - built from your answers</li>
 </ul>

 <button type="button" style={dig(styles.payBtn, 'payBtn')} onClick={onContinue}>
 Complete checkout to continue
 </button>
 </>
 )
}
