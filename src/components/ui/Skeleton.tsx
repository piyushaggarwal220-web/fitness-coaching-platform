'use client'

import type { CSSProperties } from 'react'
import { colors, radius, spacing } from '@/lib/design-tokens'

type SkeletonProps = {
  width?: string | number
  height?: string | number
  borderRadius?: number
  style?: CSSProperties
}

export function Skeleton({ width = '100%', height = 20, borderRadius = radius.sm, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, marginBottom: spacing[2], ...style }}
    />
  )
}

export function PageSkeleton() {
  return (
    <div style={{ padding: spacing[3], paddingTop: `calc(56px + ${spacing[3]}px)` }}>
      <Skeleton height={32} width="60%" />
      <Skeleton height={16} width="40%" style={{ marginTop: spacing[2] }} />
      <div style={{ marginTop: spacing[5] }}>
        <Skeleton height={120} borderRadius={radius.md} />
        <Skeleton height={120} borderRadius={radius.md} />
        <Skeleton height={80} borderRadius={radius.md} />
      </div>
    </div>
  )
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={100} borderRadius={radius.md} />
      ))}
    </>
  )
}
