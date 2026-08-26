import { describe, it, expect } from 'vitest'
import { computeDepartureCascade, computeArrivalCascade, computeRecalculate } from '../schedule'
import type { Pub } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePub(overrides: Partial<Pub> & { id: string }): Pub {
  return {
    crawl_id: 'crawl-1',
    name: `Pub ${overrides.id}`,
    address: null,
    lat: null,
    lng: null,
    order_index: 0,
    is_meeting_point: false,
    planned_dwell_minutes: 45,
    status: 'upcoming',
    planned_arrival_at: null,
    actual_arrival_at: null,
    actual_departure_at: null,
    walking_minutes_to_next: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/** UTC timestamp for a given hour and minute on a fixed test date */
function utc(h: number, m = 0): string {
  return new Date(Date.UTC(2024, 5, 29, h, m, 0, 0)).toISOString()
}

function msAt(h: number, m = 0) {
  return new Date(utc(h, m)).getTime()
}

// ---------------------------------------------------------------------------
// computeDepartureCascade
// ---------------------------------------------------------------------------

describe('computeDepartureCascade', () => {
  it('shifts future pubs earlier when departing early', () => {
    // Planned departure from pub-1 would be 14:45 (arrived 14:00, dwell 45min).
    // But we actually leave at 14:30 — 15 min early.
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', planned_dwell_minutes: 45, walking_minutes_to_next: 10, actual_departure_at: utc(14, 30) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 45, planned_arrival_at: utc(14, 55) }),
      makePub({ id: 'pub-3', order_index: 2, status: 'upcoming', planned_dwell_minutes: 30, planned_arrival_at: utc(16, 25) }),
    ]
    pubs[1].walking_minutes_to_next = 15

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 14:30 + 10min walk = 14:40 (was 14:55, now 15min earlier)
    expect(result.get('pub-2')).toBe(utc(14, 40))
    // pub-3: pub-2 arrives 14:40, dwell 45min → departs 15:25, + 15min walk = 15:40
    expect(result.get('pub-3')).toBe(utc(15, 40))
  })

  it('shifts future pubs later when departing late', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', planned_dwell_minutes: 45, walking_minutes_to_next: 10, actual_departure_at: utc(15, 0) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 45, planned_arrival_at: utc(14, 55) }),
      makePub({ id: 'pub-3', order_index: 2, status: 'upcoming', planned_dwell_minutes: 30, planned_arrival_at: utc(16, 25) }),
    ]
    pubs[1].walking_minutes_to_next = 15

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 15:00 + 10min walk = 15:10 (was 14:55, now 15min later)
    expect(result.get('pub-2')).toBe(utc(15, 10))
    // pub-3: pub-2 arrives 15:10, dwell 45min → departs 15:55, + 15min walk = 16:10
    expect(result.get('pub-3')).toBe(utc(16, 10))
  })

  it('cascades correctly through three future pubs', () => {
    const pubs: Pub[] = [
      makePub({ id: 'a', order_index: 0, status: 'visited', planned_dwell_minutes: 60, walking_minutes_to_next: 5, actual_departure_at: utc(14, 0) }),
      makePub({ id: 'b', order_index: 1, status: 'upcoming', planned_dwell_minutes: 30, walking_minutes_to_next: 10 }),
      makePub({ id: 'c', order_index: 2, status: 'upcoming', planned_dwell_minutes: 45, walking_minutes_to_next: 8 }),
      makePub({ id: 'd', order_index: 3, status: 'upcoming', planned_dwell_minutes: 60, walking_minutes_to_next: null }),
    ]

    const result = computeDepartureCascade(pubs, 'a')

    // b: 14:00 + 5min = 14:05
    expect(result.get('b')).toBe(utc(14, 5))
    // c: 14:05 + 30min dwell + 10min walk = 14:45
    expect(result.get('c')).toBe(utc(14, 45))
    // d: 14:45 + 45min dwell + 8min walk = 15:38
    expect(result.get('d')).toBe(utc(15, 38))
  })

  it('skips visited pubs between the departed pub and upcoming pubs', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', walking_minutes_to_next: 10, actual_departure_at: utc(14, 0) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'visited', planned_dwell_minutes: 45, walking_minutes_to_next: 5 }),
      makePub({ id: 'pub-3', order_index: 2, status: 'upcoming', planned_dwell_minutes: 45 }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2 is visited — should not appear in result
    expect(result.has('pub-2')).toBe(false)
    // pub-3: uses pub-2's walking_minutes_to_next (5min); cursor is still at pub-1 departure (14:00)
    expect(result.get('pub-3')).toBe(utc(14, 5))
  })

  it('returns an empty map when departed pub is not found', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', actual_departure_at: utc(14, 0) }),
    ]
    expect(computeDepartureCascade(pubs, 'nonexistent').size).toBe(0)
  })

  it('returns an empty map when departed pub has no actual_departure_at', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited' }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming' }),
    ]
    expect(computeDepartureCascade(pubs, 'pub-1').size).toBe(0)
  })

  it('returns an empty map when the departed pub is the last pub', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', actual_departure_at: utc(14, 0) }),
    ]
    expect(computeDepartureCascade(pubs, 'pub-1').size).toBe(0)
  })

  it('treats null walking_minutes_to_next as zero', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', walking_minutes_to_next: null, actual_departure_at: utc(14, 0) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 30 }),
    ]
    // No walking time → pub-2 starts immediately at departure time of pub-1
    expect(computeDepartureCascade(pubs, 'pub-1').get('pub-2')).toBe(utc(14, 0))
  })

  // -------------------------------------------------------------------------
  // Dwell time impact on cascade
  // -------------------------------------------------------------------------

  it('reflects increased dwell time at current pub in future arrival times', () => {
    // Pub-1 has increased dwell (60min instead of original 45). Departed at 15:10.
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', planned_dwell_minutes: 60, walking_minutes_to_next: 10, actual_departure_at: utc(15, 10) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 45, planned_arrival_at: utc(14, 55) }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')
    // pub-2: actual depart 15:10 + 10min walk = 15:20
    expect(result.get('pub-2')).toBe(utc(15, 20))
  })

  it('reflects decreased dwell time at current pub in future arrival times', () => {
    // Pub-1 has reduced dwell (30min). Departed at 14:30.
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited', planned_dwell_minutes: 30, walking_minutes_to_next: 10, actual_departure_at: utc(14, 30) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 45, planned_arrival_at: utc(14, 55) }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')
    // pub-2: actual depart 14:30 + 10min walk = 14:40 (25min earlier than planned)
    expect(result.get('pub-2')).toBe(utc(14, 40))
  })
})

// ---------------------------------------------------------------------------
// computeArrivalCascade
// ---------------------------------------------------------------------------

describe('computeArrivalCascade', () => {
  it('shifts future pubs later when arriving late', () => {
    // Planned arrival at pub-2: 14:00. Actual arrival: 14:20 (20min late).
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'visited' }),
      makePub({
        id: 'pub-2', order_index: 1, status: 'current',
        planned_dwell_minutes: 45, walking_minutes_to_next: 10,
        planned_arrival_at: utc(14, 0),
        actual_arrival_at: utc(14, 20),
      }),
      makePub({ id: 'pub-3', order_index: 2, status: 'upcoming', planned_dwell_minutes: 30 }),
    ]
    pubs[1].walking_minutes_to_next = 10

    const result = computeArrivalCascade(pubs, 'pub-2')

    // pub-3: arrive 14:20, dwell 45min → depart 15:05, + 10min walk = 15:15
    expect(result.get('pub-3')).toBe(utc(15, 15))
  })

  it('returns empty map when arriving on time', () => {
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'current',
        planned_arrival_at: utc(14, 0),
        actual_arrival_at: utc(14, 0),
      }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming' }),
    ]
    expect(computeArrivalCascade(pubs, 'pub-1').size).toBe(0)
  })

  it('returns empty map when arriving early', () => {
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'current',
        planned_arrival_at: utc(14, 0),
        actual_arrival_at: utc(13, 50),
      }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming' }),
    ]
    expect(computeArrivalCascade(pubs, 'pub-1').size).toBe(0)
  })

  it('returns empty map when arrived pub has no planned_arrival_at', () => {
    const pubs: Pub[] = [
      makePub({ id: 'pub-1', order_index: 0, status: 'current', actual_arrival_at: utc(14, 0) }),
      makePub({ id: 'pub-2', order_index: 1, status: 'upcoming' }),
    ]
    expect(computeArrivalCascade(pubs, 'pub-1').size).toBe(0)
  })

  it('propagates the delay through all subsequent pubs', () => {
    const pubs: Pub[] = [
      makePub({
        id: 'p1', order_index: 0, status: 'current',
        planned_dwell_minutes: 45, walking_minutes_to_next: 5,
        planned_arrival_at: utc(13, 0),
        actual_arrival_at: utc(13, 10), // 10min late
      }),
      makePub({ id: 'p2', order_index: 1, status: 'upcoming', planned_dwell_minutes: 30, walking_minutes_to_next: 8 }),
      makePub({ id: 'p3', order_index: 2, status: 'upcoming', planned_dwell_minutes: 45 }),
    ]

    const result = computeArrivalCascade(pubs, 'p1')

    // cursor = 13:10 + 45min = 13:55
    // p2: 13:55 + 5min walk = 14:00
    expect(result.get('p2')).toBe(utc(14, 0))
    // cursor = 14:00 + 30min = 14:30
    // p3: 14:30 + 8min walk = 14:38
    expect(result.get('p3')).toBe(utc(14, 38))
  })
})

// ---------------------------------------------------------------------------
// computeRecalculate
// ---------------------------------------------------------------------------

describe('computeRecalculate', () => {
  it('sets all pub times from a given start time', () => {
    const startMs = msAt(14, 0)
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 45, walking_minutes_to_next: 10 }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 60, walking_minutes_to_next: 5 }),
      makePub({ id: 'p3', order_index: 2, planned_dwell_minutes: 30 }),
    ]

    const result = computeRecalculate(pubs, startMs)

    // p1: 14:00
    expect(result.get('p1')).toBe(utc(14, 0))
    // p2: 14:00 + 45min dwell + 10min walk = 14:55
    expect(result.get('p2')).toBe(utc(14, 55))
    // p3: 14:55 + 60min dwell + 5min walk = 16:00
    expect(result.get('p3')).toBe(utc(16, 0))
  })

  it('handles a single pub', () => {
    const startMs = msAt(15, 30)
    const pubs: Pub[] = [makePub({ id: 'solo', order_index: 0, planned_dwell_minutes: 45 })]
    const result = computeRecalculate(pubs, startMs)
    expect(result.get('solo')).toBe(utc(15, 30))
    expect(result.size).toBe(1)
  })

  it('treats null walking_minutes_to_next as zero', () => {
    const startMs = msAt(14, 0)
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 30, walking_minutes_to_next: null }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 30 }),
    ]
    const result = computeRecalculate(pubs, startMs)
    // p2: 14:00 + 30min dwell + 0 walk = 14:30
    expect(result.get('p2')).toBe(utc(14, 30))
  })

  it('produces later times when started late', () => {
    const onTimeMs = msAt(14, 0)
    const lateMs = msAt(14, 15)
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 45, walking_minutes_to_next: 10 }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 30 }),
    ]

    const onTime = computeRecalculate(pubs, onTimeMs)
    const late = computeRecalculate(pubs, lateMs)

    const p2OnTime = new Date(onTime.get('p2')!).getTime()
    const p2Late = new Date(late.get('p2')!).getTime()
    expect(p2Late - p2OnTime).toBe(15 * 60 * 1000)
  })

  it('produces earlier times when started early', () => {
    const onTimeMs = msAt(14, 0)
    const earlyMs = msAt(13, 45) // 15min early
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 45, walking_minutes_to_next: 10 }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 30 }),
    ]

    const onTime = computeRecalculate(pubs, onTimeMs)
    const early = computeRecalculate(pubs, earlyMs)

    const p2OnTime = new Date(onTime.get('p2')!).getTime()
    const p2Early = new Date(early.get('p2')!).getTime()
    expect(p2OnTime - p2Early).toBe(15 * 60 * 1000)
  })

  it('returns an empty map for an empty pub list', () => {
    expect(computeRecalculate([], msAt(14, 0)).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// End-to-end scenarios
// ---------------------------------------------------------------------------

describe('end-to-end scheduling scenarios', () => {
  it('starting crawl 10min early shifts all pub times 10min earlier', () => {
    const plannedStart = msAt(14, 0)
    const actualStart = msAt(13, 50) // 10min early
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 45, walking_minutes_to_next: 10 }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 60, walking_minutes_to_next: 8 }),
      makePub({ id: 'p3', order_index: 2, planned_dwell_minutes: 30 }),
    ]

    const planned = computeRecalculate(pubs, plannedStart)
    const actual = computeRecalculate(pubs, actualStart)

    for (const pub of pubs) {
      const diff = new Date(planned.get(pub.id)!).getTime() - new Date(actual.get(pub.id)!).getTime()
      expect(diff).toBe(10 * 60 * 1000)
    }
  })

  it('starting crawl 15min late shifts all pub times 15min later', () => {
    const plannedStart = msAt(14, 0)
    const actualStart = msAt(14, 15)
    const pubs: Pub[] = [
      makePub({ id: 'p1', order_index: 0, planned_dwell_minutes: 45, walking_minutes_to_next: 10 }),
      makePub({ id: 'p2', order_index: 1, planned_dwell_minutes: 60 }),
    ]

    const planned = computeRecalculate(pubs, plannedStart)
    const actual = computeRecalculate(pubs, actualStart)

    for (const pub of pubs) {
      const diff = new Date(actual.get(pub.id)!).getTime() - new Date(planned.get(pub.id)!).getTime()
      expect(diff).toBe(15 * 60 * 1000)
    }
  })

  it('leaving pub early then cascading gives correct times for remaining pubs', () => {
    // Three pubs, planned to arrive at 14:00, 15:00 (45min dwell + 15min walk), 16:15 (60min + 15min)
    // We leave pub-1 at 14:30 instead of 14:45 (15min early)
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'visited',
        planned_dwell_minutes: 45, walking_minutes_to_next: 15,
        actual_departure_at: utc(14, 30),
      }),
      makePub({
        id: 'pub-2', order_index: 1, status: 'upcoming',
        planned_dwell_minutes: 60, walking_minutes_to_next: 15,
        planned_arrival_at: utc(15, 0),
      }),
      makePub({
        id: 'pub-3', order_index: 2, status: 'upcoming',
        planned_dwell_minutes: 30,
        planned_arrival_at: utc(16, 15),
      }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 14:30 + 15min walk = 14:45 (15min earlier than planned 15:00)
    expect(result.get('pub-2')).toBe(utc(14, 45))
    // pub-3: arrive 14:45 + 60min dwell + 15min walk = 16:00 (15min earlier than planned 16:15)
    expect(result.get('pub-3')).toBe(utc(16, 0))
  })

  it('leaving pub late then cascading gives correct times for remaining pubs', () => {
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'visited',
        planned_dwell_minutes: 45, walking_minutes_to_next: 15,
        actual_departure_at: utc(15, 5), // 20min late (was 14:45)
      }),
      makePub({
        id: 'pub-2', order_index: 1, status: 'upcoming',
        planned_dwell_minutes: 60, walking_minutes_to_next: 15,
        planned_arrival_at: utc(15, 0),
      }),
      makePub({
        id: 'pub-3', order_index: 2, status: 'upcoming',
        planned_dwell_minutes: 30,
        planned_arrival_at: utc(16, 15),
      }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 15:05 + 15min walk = 15:20
    expect(result.get('pub-2')).toBe(utc(15, 20))
    // pub-3: arrive 15:20 + 60min dwell + 15min walk = 16:35
    expect(result.get('pub-3')).toBe(utc(16, 35))
  })

  it('dwell time increase at current pub shifts future arrivals later', () => {
    // Original dwell was 45min (planned departure 14:45). Increased to 75min.
    // Actual departure: 15:15. Walk to next: 10min.
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'visited',
        planned_dwell_minutes: 75, // increased from 45
        walking_minutes_to_next: 10,
        actual_departure_at: utc(15, 15),
      }),
      makePub({
        id: 'pub-2', order_index: 1, status: 'upcoming',
        planned_dwell_minutes: 45,
        planned_arrival_at: utc(14, 55), // original planned time
      }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 15:15 + 10min = 15:25 (30min later than planned 14:55)
    expect(result.get('pub-2')).toBe(utc(15, 25))
  })

  it('dwell time decrease at current pub shifts future arrivals earlier', () => {
    // Original dwell was 45min (planned departure 14:45). Reduced to 20min.
    // Actual departure: 14:20. Walk to next: 10min.
    const pubs: Pub[] = [
      makePub({
        id: 'pub-1', order_index: 0, status: 'visited',
        planned_dwell_minutes: 20, // reduced from 45
        walking_minutes_to_next: 10,
        actual_departure_at: utc(14, 20),
      }),
      makePub({
        id: 'pub-2', order_index: 1, status: 'upcoming',
        planned_dwell_minutes: 45,
        planned_arrival_at: utc(14, 55), // original planned time
      }),
    ]

    const result = computeDepartureCascade(pubs, 'pub-1')

    // pub-2: depart 14:20 + 10min = 14:30 (25min earlier than planned 14:55)
    expect(result.get('pub-2')).toBe(utc(14, 30))
  })
})
