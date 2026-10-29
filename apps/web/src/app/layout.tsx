import type { Metadata } from 'next'
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from 'next/font/google'
import './globals.css'

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-newsreader',
})

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-hanken',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'Whence',
  description: 'Notes and questions from a YouTube video or an article.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hanken.variable} ${plexMono.variable}`}>
      <body className="bg-paper-grain">{children}</body>
    </html>
  )
}
