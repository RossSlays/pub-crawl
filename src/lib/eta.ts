import type { Pub, LeaderLocation } from './types'

// Server-side Date construction from a bare date+time string is ambiguous —
// Node parses it in the *server's* timezone (UTC on Vercel), not the crawl's
// London wall-clock time, so a start time of "18:30" silently became 19:30
// local during BST. This resolves the intended UTC instant for a London
// wall-clock date+time regardless of what timezone the process runs in.
export function londonDateTime(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const utcGuess = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`)
  const offsetMinutes = londonUtcOffsetMinutes(utcGuess)
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000)
}

function londonUtcOffsetMinutes(date: Date): number {
  const tzName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /GMT([+-]\d+)?/.exec(tzName)
  return match?.[1] ? parseInt(match[1], 10) * 60 : 0
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function walkingMinutes(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  speedKmh: number
) {
  return (haversineKm(lat1, lng1, lat2, lng2) / speedKmh) * 60
}

// Recalculate planned_arrival_at for all upcoming/current pubs
// based on the actual departure of the last visited pub (or crawl start)
export function recalculateETAs(
  pubs: Pub[],
  speedKmh: number,
  fromLat: number,
  fromLng: number,
  fromTime: Date
): Map<string, Date> {
  const sorted = [...pubs].sort((a, b) => a.order_index - b.order_index)
  const etas = new Map<string, Date>()

  let currentLat = fromLat
  let currentLng = fromLng
  let currentTime = fromTime

  for (const pub of sorted) {
    if (pub.status === 'visited' && pub.actual_arrival_at) continue
    if (pub.lat == null || pub.lng == null) continue

    const walkMins = walkingMinutes(currentLat, currentLng, pub.lat, pub.lng, speedKmh)
    const arrival = new Date(currentTime.getTime() + walkMins * 60 * 1000)
    etas.set(pub.id, arrival)

    // Next leg starts after dwell time
    currentTime = new Date(arrival.getTime() + pub.planned_dwell_minutes * 60 * 1000)
    currentLat = pub.lat
    currentLng = pub.lng
  }

  return etas
}

// Calculate planned arrival times for all pubs using fixed walking times per pub.
export function calculateScheduleFixed(pubs: Pub[], startTime: Date): Map<string, Date> {
  const sorted = [...pubs].sort((a, b) => a.order_index - b.order_index)
  const result = new Map<string, Date>()
  let currentMs = startTime.getTime()

  for (let i = 0; i < sorted.length; i++) {
    const pub = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      currentMs += prev.planned_dwell_minutes * 60 * 1000
      currentMs += (prev.walking_minutes_to_next ?? 0) * 60 * 1000
    }
    result.set(pub.id, new Date(currentMs))
  }

  return result
}

// Legacy GPS-distance-based schedule (kept for reference).
export function calculateSchedule(
  pubs: Pub[],
  startTime: Date,
  speedKmh: number
): Map<string, Date> {
  const sorted = [...pubs].sort((a, b) => a.order_index - b.order_index)
  const result = new Map<string, Date>()
  let currentMs = startTime.getTime()

  for (let i = 0; i < sorted.length; i++) {
    const pub = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      currentMs += prev.planned_dwell_minutes * 60 * 1000
      if (prev.lat != null && prev.lng != null && pub.lat != null && pub.lng != null) {
        currentMs += walkingMinutes(prev.lat, prev.lng, pub.lat, pub.lng, speedKmh) * 60 * 1000
      }
    }
    result.set(pub.id, new Date(currentMs))
  }

  return result
}

// Nearest leader's estimated arrival time at the given pub coordinates.
export function liveEtaToPoint(
  leaderLocations: LeaderLocation[],
  pubLat: number,
  pubLng: number,
  speedKmh: number,
  now: number
): Date | null {
  if (leaderLocations.length === 0) return null
  let bestMins = Infinity
  for (const ll of leaderLocations) {
    const mins = walkingMinutes(ll.lat, ll.lng, pubLat, pubLng, speedKmh)
    if (mins < bestMins) bestMins = mins
  }
  return new Date(now + bestMins * 60 * 1000)
}

export function formatDuration(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function formatETA(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function minutesUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 60000)
}
