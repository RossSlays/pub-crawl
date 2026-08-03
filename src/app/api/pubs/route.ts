import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { Pub } from '@/lib/types'
import { computeDepartureCascade, computeArrivalCascade, computeDwellCascade } from '@/lib/schedule'

export async function GET(req: Request) {
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const { data, error } = await db
    .from('pubs')
    .select('*, ratings(*)')
    .eq('crawl_id', crawlId)
    .order('order_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pubs: data })
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const body = await req.json()

  // Get max order_index for this crawl
  const { data: existing } = await db
    .from('pubs')
    .select('order_index')
    .eq('crawl_id', body.crawl_id)
    .order('order_index', { ascending: false })
    .limit(1)

  const nextIndex = existing && existing.length > 0 ? existing[0].order_index + 1 : 0

  const { data, error } = await db
    .from('pubs')
    .insert({ ...body, order_index: body.order_index ?? nextIndex })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pub: data })
}

export async function PATCH(req: Request) {
  const db = supabaseAdmin()
  const body = await req.json()
  const { id, ...updates } = body

  const leaderToken = req.headers.get('x-leader-token')
  if (leaderToken) {
    const { data: leader } = await db
      .from('leaders')
      .select('id')
      .eq('token', leaderToken)
      .single()

    if (!leader) return unauthorized()

    const leaderUpdates: Record<string, unknown> = {}
    for (const field of ['status', 'actual_arrival_at', 'actual_departure_at', 'planned_dwell_minutes']) {
      if (field in updates) leaderUpdates[field] = updates[field]
    }

    const { data, error } = await db.from('pubs').update(leaderUpdates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (leaderUpdates.status === 'current' && data.actual_arrival_at) {
      await cascadeDelay(db, data.crawl_id, data.id)
    }
    if (leaderUpdates.status === 'visited' && data.actual_departure_at) {
      await cascadeFromDeparture(db, data.crawl_id, data.id)
    }
    if ('planned_dwell_minutes' in leaderUpdates && data.status === 'current' && data.actual_arrival_at) {
      await cascadeDwellChange(db, data.crawl_id, data.id)
    }

    return NextResponse.json({ pub: data })
  }

  if (!isAdmin(req)) return unauthorized()

  const { data, error } = await db
    .from('pubs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (updates.status === 'current' && data.actual_arrival_at) {
    await cascadeDelay(db, data.crawl_id, data.id)
  }
  if (updates.status === 'visited' && data.actual_departure_at) {
    await cascadeFromDeparture(db, data.crawl_id, data.id)
  }
  if ('planned_dwell_minutes' in updates && data.status === 'current' && data.actual_arrival_at) {
    await cascadeDwellChange(db, data.crawl_id, data.id)
  }

  return NextResponse.json({ pub: data })
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  const { error } = await db.from('pubs').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function cascadeFromDeparture(db: ReturnType<typeof supabaseAdmin>, crawlId: string, departedPubId: string) {
  const { data: allPubs } = await db.from('pubs').select('*').eq('crawl_id', crawlId).order('order_index')
  if (!allPubs?.length) return
  const updates = computeDepartureCascade(allPubs as Pub[], departedPubId)
  for (const [id, planned_arrival_at] of updates) {
    await db.from('pubs').update({ planned_arrival_at }).eq('id', id)
  }
}

async function cascadeDelay(db: ReturnType<typeof supabaseAdmin>, crawlId: string, arrivedPubId: string) {
  const { data: allPubs } = await db.from('pubs').select('*').eq('crawl_id', crawlId).order('order_index')
  if (!allPubs?.length) return
  const updates = computeArrivalCascade(allPubs as Pub[], arrivedPubId)
  for (const [id, planned_arrival_at] of updates) {
    await db.from('pubs').update({ planned_arrival_at }).eq('id', id)
  }
}

async function cascadeDwellChange(db: ReturnType<typeof supabaseAdmin>, crawlId: string, currentPubId: string) {
  const { data: allPubs } = await db.from('pubs').select('*').eq('crawl_id', crawlId).order('order_index')
  if (!allPubs?.length) return
  const updates = computeDwellCascade(allPubs as Pub[], currentPubId)
  for (const [id, planned_arrival_at] of updates) {
    await db.from('pubs').update({ planned_arrival_at }).eq('id', id)
  }
}

function isAdmin(req: Request) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
