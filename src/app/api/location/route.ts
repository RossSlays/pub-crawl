import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const [locResult, leaderLocsResult] = await Promise.all([
    db.from('live_location').select('*').eq('crawl_id', crawlId).order('updated_at', { ascending: false }).limit(1).single(),
    db.from('leader_locations').select('*').eq('crawl_id', crawlId).order('updated_at'),
  ])

  return NextResponse.json({
    location: locResult.error ? null : locResult.data,
    leaderLocations: leaderLocsResult.data ?? [],
  })
}

export async function POST(req: Request) {
  const db = supabaseAdmin()
  const body = await req.json()
  const leaderToken = req.headers.get('x-leader-token')

  if (leaderToken) {
    const { data: leader } = await db
      .from('leaders')
      .select('id, name')
      .eq('token', leaderToken)
      .single()

    if (!leader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await db
      .from('leader_locations')
      .upsert(
        {
          crawl_id: body.crawl_id,
          leader_id: leader.id,
          leader_name: leader.name,
          lat: body.lat,
          lng: body.lng,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'crawl_id,leader_id' }
      )
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ location: data })
  }

  if (!isAdmin(req)) return unauthorized()

  await db.from('live_location').delete().eq('crawl_id', body.crawl_id)

  const { data, error } = await db
    .from('live_location')
    .insert({ crawl_id: body.crawl_id, lat: body.lat, lng: body.lng })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ location: data })
}

function isAdmin(req: Request) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
