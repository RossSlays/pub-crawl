import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const cookieStore = await cookies()
  const adminKey = cookieStore.get('admin_key')?.value
  const leaderToken = cookieStore.get('leader_token')?.value
  const participantToken = cookieStore.get('participant_token')?.value

  // Check leader token before admin so the admin can test leader links in the same browser
  if (leaderToken) {
    const db = supabaseAdmin()
    const { data: leader } = await db
      .from('leaders')
      .select('name, token')
      .eq('token', leaderToken)
      .single()
    if (leader) {
      return NextResponse.json({ role: 'leader', name: leader.name, token: leader.token })
    }
  }

  if (adminKey === process.env.ADMIN_SECRET) {
    if (!participantToken) {
      const COOKIE_OPTS = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      }
      const newToken = crypto.randomUUID()
      cookieStore.set('participant_token', newToken, COOKIE_OPTS)
      cookieStore.set('participant_name', 'Ross', COOKIE_OPTS)

      const db = supabaseAdmin()
      const { data: crawl } = await db.from('crawl').select('id').order('created_at', { ascending: false }).limit(1).single()
      if (crawl) {
        try {
          await db.from('participants').upsert({ token: newToken, crawl_id: crawl.id, name: 'Ross' }, { onConflict: 'token' })
        } catch (_) { /* non-critical — only affects leaderboard name resolution */ }
      }
    }
    return NextResponse.json({ role: 'admin' })
  }

  if (participantToken) {
    const name = cookieStore.get('participant_name')?.value ?? null
    return NextResponse.json({ role: 'participant', name })
  }

  return NextResponse.json({ role: 'spectator' })
}
