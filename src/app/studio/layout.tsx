import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--st-inter' })

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={inter.variable}>
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap"
      />
      {children}
    </div>
  )
}
