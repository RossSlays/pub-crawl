import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export async function POST(req: Request) {
  const body = await req.json()

  if (body.type === 'admin') {
    if (body.password !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
    }
    const cookieStore = await cookies()
    cookieStore.set('admin_key', process.env.ADMIN_SECRET!, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
    // Give admin a stable participant identity so they can rate pubs and log drinks
    if (!cookieStore.get('participant_token')?.value) {
      const participantToken = crypto.randomUUID()
      cookieStore.set('participant_token', participantToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })
      cookieStore.set('participant_name', 'Ross', { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 })

      const db = supabaseAdmin()
      const { data: crawl } = await db.from('crawl').select('id').order('created_at', { ascending: false }).limit(1).single()
      if (crawl) await upsertParticipant(db, participantToken, crawl.id, 'Ross')
    }
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'join') {
    const db = supabaseAdmin()
    const { data: crawl } = await db
      .from('crawl')
      .select('id')
      .eq('join_token', body.token)
      .single()

    if (!crawl) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const name = body.name ? String(body.name).trim().slice(0, 50) : 'Anonymous'
    const email = body.email ? String(body.email).trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    // Reuse an existing identity for this email on this crawl, if one exists.
    // This is what lets someone rejoin from a different device, browser, or
    // an incognito window without ending up as a disconnected duplicate —
    // their drinks/ratings history stays attached to the same token.
    const { data: existing } = await db
      .from('participants')
      .select('token')
      .eq('crawl_id', crawl.id)
      .eq('email', email)
      .maybeSingle()

    const participantToken = existing?.token ?? crypto.randomUUID()

    const cookieStore = await cookies()
    cookieStore.set('participant_token', participantToken, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 2 })
    cookieStore.set('crawl_id', crawl.id, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 2 })
    cookieStore.set('participant_name', name, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 2 })

    await db.from('participants').upsert(
      { token: participantToken, crawl_id: crawl.id, name, email },
      { onConflict: 'token' }
    )

    return NextResponse.json({ ok: true, rejoined: !!existing })
  }

  if (body.type === 'leave') {
    const cookieStore = await cookies()
    cookieStore.delete('participant_token')
    cookieStore.delete('participant_name')
    cookieStore.delete('crawl_id')
    return NextResponse.json({ ok: true })
  }

  if (body.type === 'leader') {
    const db = supabaseAdmin()
    const { data: leader } = await db
      .from('leaders')
      .select('id, name, token')
      .eq('token', body.token)
      .single()

    if (!leader) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const cookieStore = await cookies()
    cookieStore.set('leader_token', leader.token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 24 * 2 })
    return NextResponse.json({ ok: true, name: leader.name })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete('admin_key')
  cookieStore.delete('participant_token')
  cookieStore.delete('leader_token')
  return NextResponse.json({ ok: true })
}

async function upsertParticipant(db: ReturnType<typeof supabaseAdmin>, token: string, crawlId: string, name: string) {
  try {
    await db.from('participants').upsert({ token, crawl_id: crawlId, name }, { onConflict: 'token' })
  } catch (_) { /* non-critical — only affects leaderboard name resolution */ }
}
