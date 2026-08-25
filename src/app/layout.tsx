import type { Metadata } from 'next'
import './globals.css'
import PwaProvider from '@/components/PwaProvider'

export const metadata: Metadata = {
  title: "Jack's 30th Birthday Pub Crawl",
  description: 'Live tracker for Jack\'s 30th birthday Thames pub crawl',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Pub Crawl' },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#16120e',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <PwaProvider />
      </body>
    </html>
  )
}
