'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  crawlId: string
  donationUrl: string | null
  active: boolean
  /** Bypasses the once-ever localStorage gate — used by the admin preview button. */
  forceOpen?: boolean
  onForceClose?: () => void
}

export default function DonationModal({ crawlId, donationUrl, active, forceOpen, onForceClose }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) return
    const key = `donation-modal-seen-${crawlId}`
    if (!localStorage.getItem(key)) setShow(true)
  }, [active, crawlId])

  function dismiss() {
    if (forceOpen) {
      onForceClose?.()
      return
    }
    try { localStorage.setItem(`donation-modal-seen-${crawlId}`, '1') } catch { /* private browsing */ }
    setShow(false)
  }

  if (!show && !forceOpen) return null

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
      <div className="w-full max-w-sm bg-surface-raised border border-copper/25 rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-linear-to-br from-copper/35 to-ember/45 px-6 pt-8 pb-6 text-center text-cream border-b border-copper/25">
          <div className="text-5xl mb-3">🥃</div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-copper-bright mb-1">Before your next pint</p>
          <p className="font-display font-semibold text-2xl leading-tight">It&apos;s Jack&apos;s 30th!</p>
        </div>
        <div className="px-6 py-5 text-center space-y-4">
          <p className="text-parchment text-sm leading-relaxed">
            Instead of buying Jack a pint tonight, why not chip in <span className="font-semibold text-cream">£5</span> to his charity walk instead?
          </p>
          <p className="text-parchment text-xs leading-relaxed">
            In a couple of weeks Jack&apos;s walking <span className="font-semibold text-cream">50km with his mum</span>, in aid of <span className="font-semibold text-cream">SRUK</span> — who fund research into Scleroderma, the condition his mum lives with.
          </p>
          {donationUrl ? (
            <a href={donationUrl} target="_blank" rel="noopener noreferrer" onClick={dismiss} className="block">
              <Button className="w-full bg-linear-to-r from-copper to-copper-dim hover:from-copper-bright hover:to-copper text-ink font-bold py-3 rounded-2xl border-0 text-base h-auto">
                Donate £5 🥃
              </Button>
            </a>
          ) : (
            <p className="text-xs text-parchment-dim italic">Donation link coming soon</p>
          )}
          <button
            onClick={dismiss}
            className="text-sm text-parchment-dim hover:text-parchment transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
