import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalculateETAs, haversineKm } from '@/lib/eta'
import type { Pub } from '@/lib/types'

// Called by the leader page every 2 minutes with their current GPS position.
// Recalculates planned_arrival_at for all upcoming pubs from that position.
export async function POST(req: Request) {
  const leaderToken = req.headers.get('x-leader-token')
  if (!leaderToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lat, lng } = await req.json()
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { data: leader } = await db
    .from('leaders')
    .select('crawl_id')
    .eq('token', leaderToken)
    .single()
  if (!leader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: crawl }, { data: pubs }] = await Promise.all([
    db.from('crawl').select('walking_speed_kmh').eq('id', leader.crawl_id).single(),
    db.from('pubs').select('*').eq('crawl_id', leader.crawl_id).order('order_index'),
  ])

  if (!crawl || !pubs) return NextResponse.json({ ok: true })

  const upcoming = (pubs as Pub[]).filter(p => p.status === 'upcoming' && p.lat != null && p.lng != null)
  if (upcoming.length === 0) return NextResponse.json({ ok: true })

  // Use the leader position nearest to the next pub so that the ahead leader
  // always drives the ETA, regardless of which leader triggered this call.
  const nextPub = upcoming[0]
  const { data: allLeaderLocs } = await db
    .from('leader_locations')
    .select('lat, lng, leader_name')
    .eq('crawl_id', leader.crawl_id)

  let fromLat = lat, fromLng = lng
  if (allLeaderLocs && allLeaderLocs.length > 0 && nextPub.lat != null && nextPub.lng != null) {
    let minDist = Infinity
    for (const loc of allLeaderLocs) {
      const d = haversineKm(loc.lat, loc.lng, nextPub.lat!, nextPub.lng!)
      if (d < minDist) { minDist = d; fromLat = loc.lat; fromLng = loc.lng }
    }
  }

  const etas = recalculateETAs(upcoming, crawl.walking_speed_kmh, fromLat, fromLng, new Date())

  await Promise.all(
    [...etas.entries()].map(([pubId, eta]) =>
      db.from('pubs').update({ planned_arrival_at: eta.toISOString() }).eq('id', pubId)
    )
  )

  return NextResponse.json({ ok: true, updated: etas.size })
}
