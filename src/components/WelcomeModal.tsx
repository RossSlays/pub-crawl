'use client'

import { useEffect, useState } from 'react'
import { Beer, Map as MapIcon, ListChecks } from 'lucide-react'
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
    body: "Scan the QR code once to join — after that you can rate each pub and log your own drinks all night. Haven't scanned yet? You can still spectate.",
  },
  {
    icon: MapIcon,
    title: 'Map & Pubs tabs',
    body: 'Switch between the live map and the full pub-by-pub schedule.',
  },
]

const POUR_DURATION_MS = 3900

// Foam blobs — offsets relative to the rising foam cluster's own anchor point.
const FOAM_BLOBS = [
  { top: -30, left: -10 },
  { top: -35, left: 20 },
  { top: -25, left: 50 },
  { top: -35, left: 80 },
  { top: -30, left: 110 },
  { top: -20, left: 140 },
  { top: -30, left: 160 },
]

// Bubbles rising inside the liquid — each loops on its own delay/duration.
const BUBBLES = [
  { left: 10, delay: 1000, duration: 1000 },
  { left: 50, delay: 700, duration: 1100 },
  { left: 100, delay: 1200, duration: 1300 },
  { left: 130, delay: 1100, duration: 700 },
  { left: 170, delay: 1300, duration: 800 },
]

export default function WelcomeModal({ crawlName, subtitle }: Props) {
  const [show, setShow] = useState(false)
  const [pouring, setPouring] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function dismiss() {
    setPouring(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setShow(false)
    }, POUR_DURATION_MS)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[5000] bg-gradient-to-b from-orange-500 to-rose-500 overflow-y-auto">
      {pouring ? (
        <div className="min-h-full flex flex-col items-center justify-center gap-4 px-6">
          <div className="relative overflow-hidden" style={{ width: 248, height: 370, top: -20 }}>
            {/* Pour stream, falls from above and retracts once the glass is full */}
            <div
              className="pour-stream absolute bg-[#edaf32] rounded-[10px]"
              style={{ left: '45%', top: 0, width: 20, animation: `pourStream ${POUR_DURATION_MS}ms ease-in-out forwards` }}
            />
            {/* Glass */}
            <div className="absolute border-[10px] border-white border-t-0 rounded-b-[30px]" style={{ height: 200, width: 200, left: 14, bottom: 0 }}>
              <div className="absolute border-[10px] border-white border-b-0 rounded-t-[30px]" style={{ height: 30, width: 30, top: -40, left: -50 }} />
              <div className="absolute border-[10px] border-white border-b-0 rounded-t-[30px]" style={{ height: 30, width: 30, top: -40, right: -50 }} />

              {/* Foam cluster — rises as the glass fills */}
              <div
                className="pour-foam absolute"
                style={{ bottom: 10, animation: `foamRise ${POUR_DURATION_MS}ms ease-out forwards` }}
              >
                {FOAM_BLOBS.map(({ top, left }, i) => (
                  <div key={i} className="absolute bg-[#fefefe] rounded-[30px] z-10" style={{ width: 50, height: 50, top, left }} />
                ))}
              </div>

              {/* Liquid — an angled rectangle clipped by the glass's outer bounds */}
              <div
                className="pour-liquid absolute bg-[#edaf32] border-[10px] border-[#edaf32] rounded-b-[20px]"
                style={{ bottom: 0, left: -40, width: 110, transform: 'rotate(15deg)', animation: `liquidFill ${POUR_DURATION_MS}ms ease-in forwards` }}
              >
                {BUBBLES.map(({ left, delay, duration }, i) => (
                  <span
                    key={i}
                    className="pour-bubble absolute rounded-[10px]"
                    style={{ left, bottom: 0, width: 20, height: 20, animation: `beerBubble ${duration}ms linear ${delay}ms infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="text-white font-bold text-sm tracking-wide uppercase">Pouring your pint…</p>
        </div>
      ) : (
        <div className="min-h-full flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm text-white text-center">
            <Beer className="w-14 h-14 mx-auto mb-4" />
            {subtitle && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-100 mb-2">🎉 {subtitle}</p>
            )}
            <h1 className="text-3xl font-black mb-2">{crawlName ?? 'Welcome!'}</h1>
            <p className="text-white/80 mb-6">Here's what you can do here 👇</p>

            <div className="space-y-3 text-left mb-8">
              {POINTS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3 items-start bg-white/10 rounded-2xl p-3.5">
                  <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm">{title}</p>
                    <p className="text-xs text-white/70 mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={dismiss}
              className="w-full h-14 rounded-2xl bg-white text-orange-600 hover:bg-orange-50 font-black text-lg"
            >
              Let's go 🍺
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
