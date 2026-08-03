import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const db = supabaseAdmin()
  const cookieStore = await cookies()

  // Public lookup by join token (used by the invite/join page, pre-login)
  const joinToken = new URL(req.url).searchParams.get('join_token')
  if (joinToken) {
    const { data } = await db.from('crawl').select('*').eq('join_token', joinToken).single()
    return NextResponse.json({ crawl: data ?? null })
  }

  // Prefer crawl pinned to this participant session
  const crawlId = cookieStore.get('crawl_id')?.value
  if (crawlId) {
    const { data } = await db.from('crawl').select('*').eq('id', crawlId).single()
    if (data) return NextResponse.json({ crawl: data })
  }

  // Leader token → crawl via leaders table
  const leaderToken = cookieStore.get('leader_token')?.value
  if (leaderToken) {
    const { data: leader } = await db.from('leaders').select('crawl_id').eq('token', leaderToken).single()
    if (leader?.crawl_id) {
      const { data } = await db.from('crawl').select('*').eq('id', leader.crawl_id).single()
      if (data) return NextResponse.json({ crawl: data })
    }
  }

  // Fallback: most recently created crawl
  const { data, error } = await db
    .from('crawl')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return NextResponse.json({ crawl: null })
  return NextResponse.json({ crawl: data })
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const body = await req.json()

  const { data, error } = await db
    .from('crawl')
    .insert({ name: body.name, date: body.date })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ crawl: data })
}

export async function PATCH(req: Request) {
  if (!isAdmin(req)) return unauthorized()
  const db = supabaseAdmin()
  const body = await req.json()
  const { id, ...updates } = body

  const { data, error } = await db
    .from('crawl')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ crawl: data })
}

function isAdmin(req: Request) {
  const auth = req.headers.get('x-admin-key')
  return auth === process.env.ADMIN_SECRET
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
