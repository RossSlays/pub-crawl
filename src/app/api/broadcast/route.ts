import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

// Used to catch up on a broadcast that fired while the client was backgrounded
// and its realtime connection had dropped (e.g. phone locked mid-crawl).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'Missing crawl_id' }, { status: 400 })

  const db = supabaseAdmin()
  const { data } = await db
    .from('broadcasts')
    .select('id, message, created_at')
    .eq('crawl_id', crawlId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ broadcast: data ?? null })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const adminKey = req.headers.get('x-admin-key') ?? cookieStore.get('admin_key')?.value
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { crawl_id, message } = await req.json()
  if (!crawl_id || !message?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('broadcasts')
    .insert({ crawl_id, message: message.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ broadcast: data })
}
