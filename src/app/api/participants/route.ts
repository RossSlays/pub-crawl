import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Public list of who's joined a crawl — names only, never emails.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ participants: [] })

  const db = supabaseAdmin()
  const { data } = await db
    .from('participants')
    .select('name')
    .eq('crawl_id', crawlId)
    .order('name')

  return NextResponse.json({ participants: (data ?? []).map(p => p.name) })
}
