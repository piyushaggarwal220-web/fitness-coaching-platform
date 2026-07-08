import { notFound } from 'next/navigation'

export default function TestPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }

  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>Test Page</h1>
      <p>Development only — not available in production builds.</p>
    </div>
  )
}
