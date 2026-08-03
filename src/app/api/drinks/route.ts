import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const db = supabaseAdmin()
  const cookieStore = await cookies()
  const participantToken = cookieStore.get('participant_token')?.value ?? null

  const { data: rows } = await db
    .from('drinks')
    .select('pub_id, participant_token, beers, wine, cocktails, shots, soft_drinks')
    .eq('crawl_id', crawlId)

  const drinks = rows ?? []
  const EMPTY_TOTALS = { beers: 0, wine: 0, cocktails: 0, shots: 0, soft_drinks: 0 }

  const sumDrinks = (rows: typeof drinks) => rows.reduce(
    (acc, d) => ({
      beers: acc.beers + d.beers,
      wine: acc.wine + d.wine,
      cocktails: acc.cocktails + d.cocktails,
      shots: acc.shots + d.shots,
      soft_drinks: acc.soft_drinks + d.soft_drinks,
    }),
    { ...EMPTY_TOTALS }
  )

  const groupTotal = sumDrinks(drinks)

  const myRows = participantToken ? drinks.filter(d => d.participant_token === participantToken) : []

  const myTotal = sumDrinks(myRows)

  const myByPub = Object.fromEntries(
    myRows.map(d => [d.pub_id, { beers: d.beers, wine: d.wine, cocktails: d.cocktails, shots: d.shots, soft_drinks: d.soft_drinks }])
  )

  return NextResponse.json({ groupTotal, myTotal, myByPub })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const participantToken = cookieStore.get('participant_token')?.value
  if (!participantToken) return NextResponse.json({ error: 'Not a participant' }, { status: 403 })

  const { pub_id, crawl_id, beers, wine, cocktails, shots, soft_drinks } = await req.json()
  if (!pub_id || !crawl_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = supabaseAdmin()

  // Self-heal: back-fill a participants row for tokens issued before that table
  // existed, so the drinks leaderboard can resolve a name for them.
  try {
    const participantName = cookieStore.get('participant_name')?.value ?? 'Anonymous'
    await db.from('participants').upsert(
      { token: participantToken, crawl_id, name: participantName },
      { onConflict: 'token', ignoreDuplicates: true }
    )
  } catch (_) { /* non-critical — only affects leaderboard name resolution */ }

  // Lock once the next pub has been reached
  const { data: pub } = await db.from('pubs').select('order_index').eq('id', pub_id).single()
  if (pub) {
    const { data: nextReached } = await db
      .from('pubs')
      .select('id')
      .eq('crawl_id', crawl_id)
      .gt('order_index', pub.order_index)
      .in('status', ['current', 'visited'])
      .limit(1)
      .maybeSingle()
    if (nextReached) return NextResponse.json({ error: 'Drinks locked' }, { status: 403 })
  }
  const { error } = await db.from('drinks').upsert({
    pub_id,
    crawl_id,
    participant_token: participantToken,
    beers: Math.max(0, beers ?? 0),
    wine: Math.max(0, wine ?? 0),
    cocktails: Math.max(0, cocktails ?? 0),
    shots: Math.max(0, shots ?? 0),
    soft_drinks: Math.max(0, soft_drinks ?? 0),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'pub_id,participant_token' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
