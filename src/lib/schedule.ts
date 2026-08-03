import type { Pub } from './types'

/**
 * Compute new planned_arrival_at for all subsequent non-visited pubs after a
 * departure. The cursor starts at actual_departure_at of the departed pub and
 * advances by each preceding pub's walking_minutes_to_next, then by each pub's
 * planned_dwell_minutes.
 *
 * Returns a Map<pubId, ISO timestamp>. Empty if the departed pub isn't found or
 * has no actual_departure_at.
 */
export function computeDepartureCascade(sortedPubs: Pub[], departedPubId: string): Map<string, string> {
  const result = new Map<string, string>()
  const departedIdx = sortedPubs.findIndex(p => p.id === departedPubId)
  if (departedIdx < 0) return result

  const departedPub = sortedPubs[departedIdx]
  if (!departedPub.actual_departure_at) return result

  let cursor = new Date(departedPub.actual_departure_at).getTime()

  for (let i = departedIdx + 1; i < sortedPubs.length; i++) {
    const prev = sortedPubs[i - 1]
    const pub = sortedPubs[i]
    if (pub.status === 'visited') continue

    const newArrivalMs = cursor + (prev.walking_minutes_to_next ?? 0) * 60 * 1000
    result.set(pub.id, new Date(newArrivalMs).toISOString())
    cursor = newArrivalMs + pub.planned_dwell_minutes * 60 * 1000
  }

  return result
}

/**
 * Compute new planned_arrival_at for all subsequent non-visited pubs after a
 * late arrival. If actual_arrival_at <= planned_arrival_at (on time or early),
 * returns an empty map — no adjustment needed.
 */
export function computeArrivalCascade(sortedPubs: Pub[], arrivedPubId: string): Map<string, string> {
  const result = new Map<string, string>()
  const arrivedIdx = sortedPubs.findIndex(p => p.id === arrivedPubId)
  if (arrivedIdx < 0) return result

  const arrivedPub = sortedPubs[arrivedIdx]
  if (!arrivedPub.actual_arrival_at || !arrivedPub.planned_arrival_at) return result

  const actualMs = new Date(arrivedPub.actual_arrival_at).getTime()
  const plannedMs = new Date(arrivedPub.planned_arrival_at).getTime()
  if (actualMs <= plannedMs) return result

  let cursor = actualMs + arrivedPub.planned_dwell_minutes * 60 * 1000

  for (let i = arrivedIdx + 1; i < sortedPubs.length; i++) {
    const prev = sortedPubs[i - 1]
    const pub = sortedPubs[i]
    if (pub.status === 'visited') continue

    const newArrivalMs = cursor + (prev.walking_minutes_to_next ?? 0) * 60 * 1000
    result.set(pub.id, new Date(newArrivalMs).toISOString())
    cursor = newArrivalMs + pub.planned_dwell_minutes * 60 * 1000
  }

  return result
}

/**
 * Compute planned_arrival_at for every pub in the list, rebuilding the full
 * schedule from a given start timestamp. Pub order is determined by the array
 * order (caller must sort by order_index first).
 */
export function computeRecalculate(sortedPubs: Pub[], startMs: number): Map<string, string> {
  const result = new Map<string, string>()
  let cursor = startMs

  for (let i = 0; i < sortedPubs.length; i++) {
    if (i > 0) {
      const prev = sortedPubs[i - 1]
      cursor += prev.planned_dwell_minutes * 60 * 1000
      cursor += (prev.walking_minutes_to_next ?? 0) * 60 * 1000
    }
    result.set(sortedPubs[i].id, new Date(cursor).toISOString())
  }

  return result
}

/**
 * When dwell time is adjusted at the current pub, project the new planned
 * departure (actual_arrival_at + planned_dwell_minutes) and cascade new
 * planned_arrival_at values for all subsequent non-visited pubs.
 */
export function computeDwellCascade(sortedPubs: Pub[], currentPubId: string): Map<string, string> {
  const result = new Map<string, string>()
  const currentIdx = sortedPubs.findIndex(p => p.id === currentPubId)
  if (currentIdx < 0) return result

  const currentPub = sortedPubs[currentIdx]
  if (!currentPub.actual_arrival_at) return result

  let cursor = new Date(currentPub.actual_arrival_at).getTime() + currentPub.planned_dwell_minutes * 60 * 1000

  for (let i = currentIdx + 1; i < sortedPubs.length; i++) {
    const prev = sortedPubs[i - 1]
    const pub = sortedPubs[i]
    if (pub.status === 'visited') continue

    const newArrivalMs = cursor + (prev.walking_minutes_to_next ?? 0) * 60 * 1000
    result.set(pub.id, new Date(newArrivalMs).toISOString())
    cursor = newArrivalMs + pub.planned_dwell_minutes * 60 * 1000
  }

  return result
}
