import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function isAdmin(req: Request) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: Request) {
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')

  if (isAdmin(req)) {
    const query = db.from('leaders').select('*').order('created_at')
    if (crawlId) query.eq('crawl_id', crawlId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ leaders: data })
  }

  // Public: return names only (no tokens)
  const query = db.from('leaders').select('id, name').order('created_at')
  if (crawlId) query.eq('crawl_id', crawlId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leaders: data })
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const body = await req.json()

  const { data, error } = await db
    .from('leaders')
    .insert({ crawl_id: body.crawl_id, name: body.name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leader: data })
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  const { error } = await db.from('leaders').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
