'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PREVIEW_SALE_CODE, previewOfferQuoteForSlug, type PreviewOfferQuote } from '@/lib/payments/preview-sale-code'

const STORAGE_KEY = 'lurvox-preview456-code'

type PreviewSaleValue = {
  applied: boolean
  code: string
  apply: () => void
  quote: (slug: string) => PreviewOfferQuote | null
}

const PreviewSaleContext = createContext<PreviewSaleValue | null>(null)

export function PreviewSaleProvider({ children }: { children: ReactNode }) {
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') setApplied(true)
    } catch {
      /* private mode */
    }
  }, [])

  const apply = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* private mode keeps the click for this view */
    }
    setApplied(true)
  }, [])

  const value = useMemo<PreviewSaleValue>(
    () => ({
      applied,
      code: PREVIEW_SALE_CODE,
      apply,
      quote: (slug: string) => previewOfferQuoteForSlug(slug, applied),
    }),
    [applied, apply],
  )

  return <PreviewSaleContext.Provider value={value}>{children}</PreviewSaleContext.Provider>
}

export function usePreviewSale(): PreviewSaleValue {
  const value = useContext(PreviewSaleContext)
  if (!value) {
    throw new Error('usePreviewSale must be used inside PreviewSaleProvider')
  }
  return value
}
