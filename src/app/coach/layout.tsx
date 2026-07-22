'use client'

/** Coach route layout — scopes the light portal theme. */

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="coach-portal" data-coach-theme="light">
      {children}
    </div>
  )
}
