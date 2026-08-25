'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock, Navigation } from 'lucide-react'
import { formatETA, liveEtaToPoint, minutesUntil } from '@/lib/eta'
import type { Crawl, Pub, LeaderLocation } from '@/lib/types'

interface Props {
  crawl: Crawl | null
  currentPub: Pub | null
  nextPub: Pub | null
  leaderLocations?: LeaderLocation[]
  scheduledNextTime?: Date | null
}

function useCountdown(targetDate: Date | null) {
  const [diff, setDiff] = useState<number | null>(null)

  useEffect(() => {
    if (!targetDate) return
    const tick = () => setDiff(targetDate.getTime() - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return diff
}

function formatCountdown(ms: number) {
  if (ms <= 0) return 'Starting now!'
  const totalSecs = Math.floor(ms / 1000)
  const d = Math.floor(totalSecs / 86400)
  const h = Math.floor((totalSecs % 86400) / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export default function StatusBar({ crawl, currentPub, nextPub, leaderLocations = [], scheduledNextTime }: Props) {
  // Build start datetime for the pending countdown
  const startDate = useMemo(() => {
    if (!crawl?.start_time || !crawl?.date) return null
    const [h, m] = crawl.start_time.split(':').map(Number)
    const d = new Date(crawl.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    return d
  }, [crawl?.start_time, crawl?.date])

  const countdownMs = useCountdown(crawl?.status === 'pending' ? startDate : null)

  // Live ETA — recalculated whenever a leader moves; countdown ticks it down between updates
  const liveEtaDate = useMemo(() => {
    if (!nextPub?.lat || !nextPub?.lng || !crawl?.walking_speed_kmh || leaderLocations.length === 0) return null
    return liveEtaToPoint(leaderLocations, nextPub.lat, nextPub.lng, crawl.walking_speed_kmh, Date.now())
  }, [leaderLocations, nextPub?.lat, nextPub?.lng, crawl?.walking_speed_kmh])

  const liveCountdownMs = useCountdown(liveEtaDate)

  const plannedEta = scheduledNextTime ?? (nextPub?.planned_arrival_at ? new Date(nextPub.planned_arrival_at) : null)
  const plannedMins = plannedEta ? minutesUntil(plannedEta) : null

  if (crawl?.status === 'pending') {
    return (
      <div className="rounded-2xl bg-surface-raised shadow-md border border-copper/20 overflow-hidden">
        {startDate && countdownMs !== null ? (
          <div className="px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-parchment-dim mb-1">Crawl starts in</p>
            <p className="font-black text-3xl text-cream tabular-nums leading-tight">
              {countdownMs > 0 ? formatCountdown(countdownMs) : '🍺 Let\'s go!'}
            </p>
            <p className="text-xs text-parchment-dim mt-1">
              {startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} ·{' '}
              {startDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        ) : (
          <div className="px-4 py-5 text-center">
            <div className="text-2xl mb-1">🎉</div>
            <p className="font-black text-lg text-cream">Get ready!</p>
            <p className="text-parchment text-sm">The crawl hasn't started yet</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-md border border-cream/10">
      {currentPub && (
        <div className="bg-gradient-to-r from-copper to-ember px-4 py-4 text-cream">
          <div className="flex items-center gap-2 mb-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-surface-raised opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-surface-raised" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cream/70">Here now</p>
          </div>
          <p className="font-display font-semibold text-2xl leading-tight">{currentPub.name}</p>
          {currentPub.actual_arrival_at && (
            <p className="text-xs text-cream/60 mt-1">
              Arrived {formatETA(new Date(currentPub.actual_arrival_at))}
            </p>
          )}
        </div>
      )}

      {nextPub && (
        <div className="bg-surface-raised px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-parchment-dim">Next stop</p>
            <p className="font-display font-semibold text-cream text-lg leading-tight truncate">{nextPub.name}</p>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
            {/* Live ETA — shows when leaders are actively sharing location */}
            {liveEtaDate && liveCountdownMs !== null && (
              <div className="bg-copper text-cream font-bold text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <Navigation className="w-3.5 h-3.5" />
                {liveCountdownMs > 0
                  ? `~${Math.round(liveCountdownMs / 60000)} min`
                  : 'Almost there!'
                }
              </div>
            )}

            {/* Planned/scheduled time */}
            {plannedEta && (
              <div className={`flex items-center gap-1 whitespace-nowrap ${liveEtaDate ? 'text-xs text-parchment-dim' : 'bg-copper/15 text-copper-bright font-bold text-sm px-3 py-1.5 rounded-full'}`}>
                {!liveEtaDate && <Clock className="w-3.5 h-3.5" />}
                {liveEtaDate
                  ? `Planned ${formatETA(plannedEta)}`
                  : plannedMins != null && plannedMins > 0
                    ? `~${plannedMins} min`
                    : formatETA(plannedEta)
                }
              </div>
            )}
          </div>
        </div>
      )}

      {!nextPub && currentPub?.status === 'current' && (
        <div className="bg-surface-raised px-4 py-3 border-t border-cream/10">
          <p className="text-sm text-parchment text-center">🏁 Last stop on the crawl!</p>
        </div>
      )}
    </div>
  )
}
