import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const adminKey = req.headers.get('x-admin-key')
  if (adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { crawl_id } = await req.json()
  if (!crawl_id) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const db = supabaseAdmin()

  await Promise.all([
    // Reset all pubs to upcoming, clear timestamps
    db.from('pubs')
      .update({ status: 'upcoming', actual_arrival_at: null, actual_departure_at: null, planned_arrival_at: null })
      .eq('crawl_id', crawl_id),

    // Reset crawl status
    db.from('crawl').update({ status: 'pending' }).eq('id', crawl_id),

    // Clear live group location
    db.from('live_location').delete().eq('crawl_id', crawl_id),

    // Clear leader GPS positions
    db.from('leader_locations').delete().eq('crawl_id', crawl_id),

    // Clear drinks
    db.from('drinks').delete().eq('crawl_id', crawl_id),
  ])

  // Clear ratings for pubs in this crawl (no crawl_id FK on ratings, join via pubs)
  const { data: pubRows } = await db.from('pubs').select('id').eq('crawl_id', crawl_id)
  if (pubRows?.length) {
    const pubIds = pubRows.map(p => p.id)
    await db.from('ratings').delete().in('pub_id', pubIds)
  }

  return NextResponse.json({ ok: true })
}
