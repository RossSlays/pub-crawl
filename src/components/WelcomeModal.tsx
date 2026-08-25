'use client'

import { useEffect, useState } from 'react'
import { Beer, Map as MapIcon, ListChecks, Navigation } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'welcome-seen-v1'

interface Props {
  crawlName?: string
  subtitle?: string | null
}

const POINTS = [
  {
    icon: Beer,
    title: 'Live tracker',
    body: "See where the group is, what's next, and when you'll get there.",
  },
  {
    icon: ListChecks,
    title: 'Join in',
    body: "Scan the QR code when you arrive at a pub to rate it and log your own drinks. Haven't scanned yet? You can still spectate.",
  },
  {
    icon: MapIcon,
    title: 'Map & Pubs tabs',
    body: 'Switch between the live map and the full pub-by-pub schedule.',
  },
  {
    icon: Navigation,
    title: 'Live GPS',
    body: "Crawl leaders can share their location, so everyone sees real-time ETAs to the next stop.",
  },
]

export default function WelcomeModal({ crawlName, subtitle }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[5000] bg-gradient-to-b from-copper to-ember overflow-y-auto">
      <div className="min-h-full flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm text-cream text-center">
          <Beer className="w-14 h-14 mx-auto mb-4" />
          {subtitle && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cream/70 mb-2">🎉 {subtitle}</p>
          )}
          <h1 className="font-display font-semibold text-3xl mb-2">{crawlName ?? 'Welcome!'}</h1>
          <p className="text-cream/80 mb-6">Here's what you can do here 👇</p>

          <div className="space-y-3 text-left mb-8">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3 items-start bg-cream/10 rounded-2xl p-3.5">
                <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">{title}</p>
                  <p className="text-xs text-cream/70 mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={dismiss}
            className="w-full h-14 rounded-2xl bg-surface-raised text-copper-bright hover:bg-copper/10 font-black text-lg"
          >
            Let's go 🍺
          </Button>
        </div>
      </div>
    </div>
  )
}
