import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { Pub } from '@/lib/types'
import { computeRecalculate } from '@/lib/schedule'
import { londonDateTime } from '@/lib/eta'

export async function POST(req: Request) {
  const adminKey = req.headers.get('x-admin-key')
  if (adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { crawl_id } = await req.json()
  if (!crawl_id) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: crawl } = await db.from('crawl').select('*').eq('id', crawl_id).single()
  const { data: pubs } = await db.from('pubs').select('*').eq('crawl_id', crawl_id).order('order_index')

  if (!crawl?.start_time || !crawl?.date) {
    return NextResponse.json({ error: 'Crawl has no start time set' }, { status: 400 })
  }
  if (!pubs?.length) return NextResponse.json({ ok: true })

  const startDate = londonDateTime(crawl.date as string, crawl.start_time as string)

  const updates = computeRecalculate(pubs as Pub[], startDate.getTime())
  for (const [id, planned_arrival_at] of updates) {
    await db.from('pubs').update({ planned_arrival_at }).eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
