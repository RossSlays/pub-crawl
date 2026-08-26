'use client'

import { useRef, useEffect, useState } from 'react'
import { totalDrinks } from '@/lib/drinks'
import type { DrinkTotals } from '@/lib/types'

export interface RecapData {
  crawlName: string
  date: string
  pubsVisited: number
  totalPubs: number
  groupDrinks: DrinkTotals
  bestPub: { name: string; avg: number } | null
  topDrinker: { name: string; total: number } | null
  myDrinks?: DrinkTotals
  participantName?: string | null
}

interface Props {
  data: RecapData
  onClose: () => void
}

export default function RecapCard({ data, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sharing, setSharing] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawCard(canvas, data)
    setReady(true)
  }, [data])

  async function share() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSharing(true)
    try {
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/png'))
      const file = new File([blob], 'pub-crawl-recap.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${data.crawlName} Recap` })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'pub-crawl-recap.png'
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[3000] flex flex-col items-center justify-end bg-black/90 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm flex flex-col" style={{ maxHeight: '95dvh' }}>
        {/* Canvas preview — scrollable area */}
        <div className="flex-1 overflow-y-auto px-4 pt-4">
          <canvas
            ref={canvasRef}
            className="w-full rounded-2xl shadow-2xl"
            style={{ display: 'block', aspectRatio: '4/5' }}
          />
        </div>

        {/* Action bar */}
        <div className="shrink-0 bg-white rounded-t-3xl px-5 pt-5 pb-8 space-y-3 mt-2">
          <p className="text-center text-xs text-gray-400">Long-press the card to save, or tap Share</p>
          <button
            onClick={share}
            disabled={sharing || !ready}
            className="w-full bg-gradient-to-r from-violet-500 to-rose-500 text-white font-bold py-3.5 rounded-2xl text-base disabled:opacity-50"
          >
            {sharing ? 'Sharing…' : 'Share recap 🎉'}
          </button>
          <button onClick={onClose} className="w-full text-gray-400 text-sm py-2">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Canvas drawing ────────────────────────────────────────────────────────────

const W = 1080
const H = 1350
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif'

function drawCard(canvas: HTMLCanvasElement, d: RecapData) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0f0c29')
  bg.addColorStop(0.5, '#1e1b4b')
  bg.addColorStop(1, '#4c0519')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle glow orbs
  glow(ctx, W * 0.85, H * 0.12, 420, 'rgba(139, 92, 246, 0.18)')
  glow(ctx, W * 0.15, H * 0.85, 320, 'rgba(225, 29, 72, 0.15)')

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.textAlign = 'center'

  text(ctx, '🍺 PUB CRAWL RECAP', W / 2, 148, {
    font: `500 44px ${FONT}`,
    fill: 'rgba(255,255,255,0.4)',
    letterSpacing: 6,
  })

  // Crawl name — shrink font if long
  const nameSize = d.crawlName.length > 16 ? 80 : d.crawlName.length > 10 ? 96 : 112
  text(ctx, d.crawlName, W / 2, 290, { font: `900 ${nameSize}px ${FONT}`, fill: '#fff' })

  // Date
  const dateLabel = formatDate(d.date)
  text(ctx, dateLabel, W / 2, 370, { font: `500 44px ${FONT}`, fill: 'rgba(255,255,255,0.5)' })

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(100, 420); ctx.lineTo(W - 100, 420); ctx.stroke()

  // ── Big stats row — centered in the remaining space ───────────────────────────
  // Prefer the viewer's own drinks (this is their personal recap); fall back to
  // the group total for spectators, who have no drinks logged of their own.
  const drinksLabel = d.myDrinks ? 'YOUR DRINKS' : 'DRINKS'
  const drinksTotal = totalDrinks(d.myDrinks ?? d.groupDrinks)

  const statsY = 420 + (H - 100 - 420) / 2
  bigStat(ctx, W / 4, statsY, `${d.pubsVisited}/${d.totalPubs}`, 'PUBS', '📍')
  bigStat(ctx, (W * 3) / 4, statsY, String(drinksTotal), drinksLabel, '🍻')

  // ── Footer ────────────────────────────────────────────────────────────────────
  text(ctx, 'pub crawl app', W / 2, H - 70, {
    font: `500 38px ${FONT}`,
    fill: 'rgba(255,255,255,0.18)',
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { font: string; fill: string; letterSpacing?: number }
) {
  ctx.font = opts.font
  ctx.fillStyle = opts.fill
  ctx.textAlign = 'center'
  ctx.fillText(str, x, y)
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'transparent')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function bigStat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  value: string,
  label: string,
  emoji: string
) {
  text(ctx, emoji, cx, cy - 60, { font: `64px serif`, fill: '#fff' })
  text(ctx, value, cx, cy + 60, { font: `900 108px ${FONT}`, fill: '#fff' })
  text(ctx, label, cx, cy + 118, { font: `500 40px ${FONT}`, fill: 'rgba(255,255,255,0.45)' })
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}
