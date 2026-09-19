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
  className,
  children,
}: {
  plan: string
  planName?: string
  value?: number
  source?: string
  className?: string
  children: React.ReactNode
}) {
  const [href, setHref] = useState(`/checkout?plan=${plan}`)

  useEffect(() => {
    persistMetaClickIdsFromLocation()
    setHref(checkoutHrefWithAttribution(plan))
  }, [plan])

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
        })
      }
    >
      {children}
    </Link>
  )
}
