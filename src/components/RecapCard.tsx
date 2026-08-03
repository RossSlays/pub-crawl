'use client'

import { useRef, useEffect, useState } from 'react'
import { DRINK_TYPES, totalDrinks } from '@/lib/drinks'
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

const CANVAS_DRINK_LABELS: Record<string, string> = {
  beers: 'BEERS',
  wine: 'WINE',
  cocktails: 'COCKTAILS',
  shots: 'SHOTS',
  soft_drinks: 'SOFTS',
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
            style={{ display: 'block', aspectRatio: '9/16' }}
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
const H = 1920
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
  glow(ctx, W * 0.15, H * 0.72, 320, 'rgba(225, 29, 72, 0.15)')

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

  // ── Big stats row ────────────────────────────────────────────────────────────
  bigStat(ctx, W / 4, 570, `${d.pubsVisited}/${d.totalPubs}`, 'PUBS', '📍')
  bigStat(ctx, (W * 3) / 4, 570, String(totalDrinks(d.groupDrinks)), 'DRINKS', '🍻')

  // ── Drink breakdown tiles — 3 on top row, 2 on the row below ─────────────────
  const tileY = 790
  const tileRowH = 220
  const tileGap = 24
  const row1 = DRINK_TYPES.slice(0, 3)
  const row2 = DRINK_TYPES.slice(3)
  drawDrinkTileRow(ctx, row1.map(({ key, emoji }) => ({ emoji, label: CANVAS_DRINK_LABELS[key], val: d.groupDrinks[key] })), tileY)
  drawDrinkTileRow(ctx, row2.map(({ key, emoji }) => ({ emoji, label: CANVAS_DRINK_LABELS[key], val: d.groupDrinks[key] })), tileY + tileRowH + tileGap)

  // ── Best pub ─────────────────────────────────────────────────────────────────
  let nextY = tileY + tileRowH * 2 + tileGap + 70
  if (d.bestPub) {
    infoRow(ctx, nextY, '⭐', 'BEST RATED PUB', d.bestPub.name, `${d.bestPub.avg.toFixed(1)} ★`)
    nextY += 220
  }

  // ── Top drinker ───────────────────────────────────────────────────────────────
  if (d.topDrinker) {
    infoRow(ctx, nextY, '🏆', 'TOP DRINKER', d.topDrinker.name, `${d.topDrinker.total} drinks`)
    nextY += 220
  }

  // ── Personal stats ────────────────────────────────────────────────────────────
  if (d.participantName && d.myDrinks) {
    const psY = nextY + 20
    const grad = ctx.createLinearGradient(60, psY, W - 60, psY + 210)
    grad.addColorStop(0, 'rgba(124,58,237,0.28)')
    grad.addColorStop(1, 'rgba(225,29,72,0.28)')
    tile(ctx, 60, psY, W - 120, 210, grad)

    text(ctx, `${d.participantName.toUpperCase()}'S NIGHT`, W / 2, psY + 66, {
      font: `700 38px ${FONT}`,
      fill: 'rgba(255,255,255,0.55)',
    })

    const parts = DRINK_TYPES.filter(({ key }) => d.myDrinks![key] > 0).map(({ key, emoji }) => `${emoji} ${d.myDrinks![key]}`)
    const partsFontSize = parts.length >= 4 ? 44 : 54

    text(ctx, parts.length ? parts.join('   ') : 'Nothing logged', W / 2, psY + 154, {
      font: `700 ${partsFontSize}px ${FONT}`,
      fill: '#fff',
    })
  }

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

function tile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | CanvasGradient
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 28)
  ctx.fillStyle = fill
  ctx.fill()
}

function drawDrinkTileRow(
  ctx: CanvasRenderingContext2D,
  items: { emoji: string; label: string; val: number }[],
  y: number
) {
  const totalW = W - 80
  const gap = 16
  const tileW = (totalW - gap * (items.length - 1)) / items.length
  items.forEach(({ emoji, label, val }, i) => {
    const tx = 40 + (tileW + gap) * i
    tile(ctx, tx, y, tileW, 220, 'rgba(255,255,255,0.07)')
    const cx = tx + tileW / 2
    text(ctx, emoji, cx, y + 76, { font: `54px serif`, fill: '#fff' })
    text(ctx, String(val), cx, y + 164, { font: `900 72px ${FONT}`, fill: '#fff' })
    text(ctx, label, cx, y + 210, { font: `500 34px ${FONT}`, fill: 'rgba(255,255,255,0.45)' })
  })
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

function infoRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  emoji: string,
  label: string,
  name: string,
  aside: string
) {
  tile(ctx, 60, y, W - 120, 190, 'rgba(255,255,255,0.07)')

  // Emoji
  ctx.font = `58px serif`
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.fillText(emoji, 108, y + 118)

  // Label
  ctx.font = `500 36px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(label, 196, y + 78)

  // Name — truncate if needed
  ctx.font = `700 56px ${FONT}`
  ctx.fillStyle = '#fff'
  const maxW = W - 340
  let nameStr = name
  while (ctx.measureText(nameStr).width > maxW && nameStr.length > 3) {
    nameStr = nameStr.slice(0, -1)
  }
  if (nameStr !== name) nameStr = nameStr.trim() + '…'
  ctx.fillText(nameStr, 196, y + 150)

  // Aside (right-aligned)
  ctx.font = `500 40px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.textAlign = 'right'
  ctx.fillText(aside, W - 108, y + 120)
  ctx.textAlign = 'center'
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
