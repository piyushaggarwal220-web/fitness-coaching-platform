'use client'

import { useEffect, useState } from 'react'
import { DemoTour } from '@/components/demo/DemoTour'
import { consumeDemoTourOffer, readDemoTourDone } from '@/lib/demo-tour'
import { PUBLIC_DEMO_READ_ONLY_MESSAGE } from '@/lib/public-demo'
import { usePublicDemo } from '@/hooks/usePublicDemo'

export function PublicDemoBanner() {
  const isDemo = usePublicDemo()
  const [tourOpen, setTourOpen] = useState(false)
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!isDemo) return
    const offered = consumeDemoTourOffer()
    if (offered && !readDemoTourDone()) setShowHint(true)
  }, [isDemo])

  if (!isDemo) return null

  return (
    <>
      <div
        role="status"
        style={{
          margin: '0 0 16px',
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(255, 98, 0, 0.12)',
          border: '1px solid rgba(255, 98, 0, 0.35)',
          color: '#ffb07a',
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.45,
        }}
      >
        <p style={{ margin: 0 }}>{PUBLIC_DEMO_READ_ONLY_MESSAGE}</p>
        {showHint ? (
          <p style={{ margin: '8px 0 0', color: '#fff' }}>Take a 30-second tour of where everything lives.</p>
        ) : null}
        <button
          type="button"
          onClick={() => setTourOpen(true)}
          style={{
            marginTop: 10,
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 10,
            border: '1px solid rgba(255, 255, 255, 0.22)',
            background: showHint ? '#ff6200' : 'transparent',
            color: showHint ? '#09090b' : '#fff',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Take a short tour
        </button>
      </div>
      <DemoTour
        open={tourOpen}
        onClose={() => {
          setTourOpen(false)
          setShowHint(false)
        }}
      />
    </>
  )
}
