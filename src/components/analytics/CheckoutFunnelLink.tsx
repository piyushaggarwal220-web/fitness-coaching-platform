'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  checkoutHrefWithAttribution,
  persistMetaClickIdsFromLocation,
} from '@/lib/analytics/meta-attribution'
import { trackFunnelStep } from '@/lib/analytics/funnel'

export function CheckoutFunnelLink({
  plan,
  planName,
  value,
  source = 'instant',
  landingPath,
  className,
  children,
}: {
  plan: string
  planName?: string
  value?: number
  source?: string
  landingPath?: string
  className?: string
  children: React.ReactNode
}) {
  const [href, setHref] = useState(
    `/checkout?plan=${plan}${landingPath ? `&landing=${encodeURIComponent(landingPath)}` : ''}`
  )

  useEffect(() => {
    persistMetaClickIdsFromLocation()
    setHref(checkoutHrefWithAttribution(plan, landingPath))
  }, [plan, landingPath])

  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        trackFunnelStep('plan_click', {
          plan,
          plan_name: planName,
          value,
          source,
          ...(landingPath ? { path: landingPath } : {}),
        })
      }
    >
      {children}
    </Link>
  )
}
