import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

// Returns this participant's own ratings (by pub) for a crawl, so the rating
// widget can prefill with a previous submission instead of resetting on reload.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const cookieStore = await cookies()
  const participantToken = cookieStore.get('participant_token')?.value
  if (!participantToken) return NextResponse.json({ myRatings: {} })

  const db = supabaseAdmin()
  const { data } = await db
    .from('ratings')
    .select('*, pubs!inner(crawl_id)')
    .eq('participant_token', participantToken)
    .eq('pubs.crawl_id', crawlId)

  const myRatings = Object.fromEntries(
    (data ?? []).map(({ pubs: _pubs, ...rating }) => [rating.pub_id, rating])
  )
  return NextResponse.json({ myRatings })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const participantToken = cookieStore.get('participant_token')?.value

  if (!participantToken) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 403 })
  }

  const db = supabaseAdmin()
  const body = await req.json()

  const score = Number(body.score)
  if (!Number.isFinite(score) || score < 0.5 || score > 5 || (score * 2) % 1 !== 0) {
    return NextResponse.json({ error: 'Score must be between 0.5 and 5, in half-star steps' }, { status: 400 })
  }

  const { data: pub } = await db.from('pubs').select('status, order_index, crawl_id').eq('id', body.pub_id).single()
  if (!pub || pub.status === 'upcoming') {
    return NextResponse.json({ error: 'Pub not yet reached' }, { status: 400 })
  }

  // Lock once the next pub has been reached
  const { data: nextReached } = await db
    .from('pubs')
    .select('id')
    .eq('crawl_id', pub.crawl_id)
    .gt('order_index', pub.order_index)
    .in('status', ['current', 'visited'])
    .limit(1)
    .maybeSingle()
  if (nextReached) {
    return NextResponse.json({ error: 'Ratings locked' }, { status: 403 })
  }

  const { data, error } = await db
    .from('ratings')
    .upsert(
      { pub_id: body.pub_id, participant_token: participantToken, score, comment: body.comment },
      { onConflict: 'pub_id,participant_token' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rating: data })
}
