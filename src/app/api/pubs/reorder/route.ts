import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized()

  const { crawl_id, ids } = await req.json() as { crawl_id: string; ids: string[] }
  if (!crawl_id || !Array.isArray(ids)) {
    return NextResponse.json({ error: 'Missing crawl_id or ids' }, { status: 400 })
  }

  const db = supabaseAdmin()
  await Promise.all(
    ids.map((id, index) =>
      db.from('pubs').update({ order_index: index }).eq('id', id).eq('crawl_id', crawl_id)
    )
  )

  return NextResponse.json({ ok: true })
}

function isAdmin(req: Request) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
