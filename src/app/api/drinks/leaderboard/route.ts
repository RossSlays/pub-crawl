import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { totalPoints } from '@/lib/drinks'

export async function GET(req: Request) {
  const db = supabaseAdmin()
  const { searchParams } = new URL(req.url)
  const crawlId = searchParams.get('crawl_id')
  if (!crawlId) return NextResponse.json({ error: 'crawl_id required' }, { status: 400 })

  const [{ data: drinks }, { data: participants }] = await Promise.all([
    db.from('drinks').select('participant_token, beers, wine, cocktails, shots, soft_drinks').eq('crawl_id', crawlId),
    db.from('participants').select('token, name').eq('crawl_id', crawlId),
  ])

  if (!drinks) return NextResponse.json({ leaderboard: [] })

  const nameMap = new Map((participants ?? []).map(p => [p.token, p.name]))

  const totals = new Map<string, { name: string; beers: number; wine: number; cocktails: number; shots: number; soft_drinks: number; total: number; points: number }>()

  for (const d of drinks) {
    const token = d.participant_token
    if (!token) continue
    if (!totals.has(token)) {
      totals.set(token, { name: nameMap.get(token) ?? 'Unknown', beers: 0, wine: 0, cocktails: 0, shots: 0, soft_drinks: 0, total: 0, points: 0 })
    }
    const entry = totals.get(token)!
    entry.beers += d.beers ?? 0
    entry.wine += d.wine ?? 0
    entry.cocktails += d.cocktails ?? 0
    entry.shots += d.shots ?? 0
    entry.soft_drinks += d.soft_drinks ?? 0
    entry.total += (d.beers ?? 0) + (d.wine ?? 0) + (d.cocktails ?? 0) + (d.shots ?? 0) + (d.soft_drinks ?? 0)
  }

  // Rank by weighted points (soft drinks score 0) so they can't inflate rank —
  // ties broken by raw drink count.
  for (const entry of totals.values()) entry.points = totalPoints(entry)
  const leaderboard = Array.from(totals.values()).sort((a, b) => b.points - a.points || b.total - a.total)
  return NextResponse.json({ leaderboard })
}
