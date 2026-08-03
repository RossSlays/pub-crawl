import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ count: 0 })

  const db = supabaseAdmin()
  const { count } = await db
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('crawl_id', crawlId)

  return NextResponse.json({ count: count ?? 0 })
}
