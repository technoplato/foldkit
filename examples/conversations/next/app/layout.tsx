import type { ReactNode } from 'react'

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => (
  <html lang="en">
    <body className="min-h-screen bg-zinc-950 text-zinc-100">{children}</body>
  </html>
)

export default RootLayout
