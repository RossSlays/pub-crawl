'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import StatusBar from '@/components/StatusBar'
import WelcomeModal from '@/components/WelcomeModal'
import PubCard from '@/components/PubCard'
import RecapCard, { type RecapData } from '@/components/RecapCard'
import { Beer, Map as MapIcon, List, Settings, Navigation, Share2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { calculateScheduleFixed, formatDuration } from '@/lib/eta'
import { DRINK_TYPES, EMPTY_DRINK_TOTALS, totalDrinks, hasAnyDrinks } from '@/lib/drinks'
import type { Crawl, Pub, LiveLocation, LeaderLocation, Rating, DrinkTotals } from '@/lib/types'

const CrawlMap = dynamic(() => import('@/components/map/CrawlMap'), { ssr: false })

type ViewMode = 'spectator' | 'participant' | 'leader'
type TabMode = 'map' | 'list'

const CACHE_KEY = 'pub-crawl-cache-v1'
type CrawlCache = {
  crawl: Crawl | null
  pubs: Pub[]
  location: LiveLocation | null
  leaderLocations: LeaderLocation[]
  ratings: Rating[]
}

export default function HomePage() {
  const [crawl, setCrawl] = useState<Crawl | null>(null)
  const [pubs, setPubs] = useState<Pub[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [location, setLocation] = useState<LiveLocation | null>(null)
  const [leaderLocations, setLeaderLocations] = useState<LeaderLocation[]>([])
  const [leaderNames, setLeaderNames] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('spectator')
  const [isAdmin, setIsAdmin] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  async function leaveCrawl() {
    if (!window.confirm("Leave the crawl? You'll stop being able to log drinks or rate pubs unless you scan the QR code again.")) return
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leave' }),
    })
    setShowStats(false)
    setViewMode('spectator')
    setParticipantName(null)
    setMyRatings({})
    setMyDrinks(EMPTY_DRINK_TOTALS)
    setMyDrinksByPub({})
  }

  function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: crawl?.name ?? 'Pub Crawl', url })
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      })
    }
  }
  const [participantName, setParticipantName] = useState<string | null>(null)
  const [tab, setTab] = useState<TabMode>('map')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [myRatings, setMyRatings] = useState<Record<string, Rating>>({})
  const [dwellMs, setDwellMs] = useState<number | null>(null)
  const [pubBanner, setPubBanner] = useState<string | null>(null)
  const [arrivalModal, setArrivalModal] = useState<{ pubName: string; pubId: string } | null>(null)
  const [leaderHintDismissed, setLeaderHintDismissed] = useState(false)
  const prevPubIdRef = useRef<string | null | undefined>(undefined)
  const [groupDrinks, setGroupDrinks] = useState<DrinkTotals>(EMPTY_DRINK_TOTALS)
  const [myDrinks, setMyDrinks] = useState<DrinkTotals>(EMPTY_DRINK_TOTALS)
  const [myDrinksByPub, setMyDrinksByPub] = useState<Record<string, DrinkTotals>>({})
  const [leaderboard, setLeaderboard] = useState<{ name: string; beers: number; wine: number; cocktails: number; shots: number; soft_drinks: number; total: number }[]>([])
  const [showStats, setShowStats] = useState(false)
  const [statsTab, setStatsTab] = useState<'my' | 'group'>('group')
  const [showRecap, setShowRecap] = useState(false)
  const [weather, setWeather] = useState<{ temp: number; emoji: string } | null>(null)
  const [participantCount, setParticipantCount] = useState<number | null>(null)
  const [showParticipants, setShowParticipants] = useState(false)
  const [participantNames, setParticipantNames] = useState<string[] | null>(null)
  const [broadcast, setBroadcast] = useState<{ message: string } | null>(null)
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBroadcastIdRef = useRef<string | null>(null)

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
      ).then(r => r.json())
      const code: number = res.current?.weather_code ?? 0
      const temp = Math.round(res.current?.temperature_2m ?? 0)
      const emoji =
        code === 0 ? '☀️' :
        code <= 2 ? '🌤️' :
        code === 3 ? '☁️' :
        code <= 48 ? '🌫️' :
        code <= 55 ? '🌦️' :
        code <= 67 ? '🌧️' :
        code <= 77 ? '❄️' :
        code <= 82 ? '🌦️' :
        code <= 86 ? '🌨️' : '⛈️'
      setWeather({ temp, emoji })
    } catch { /* silently skip if offline or API down */ }
  }, [])

  const fetchParticipantCount = useCallback(async (crawlId: string) => {
    try {
      const res = await fetch(`/api/participants/count?crawl_id=${crawlId}`).then(r => r.json())
      if (typeof res.count === 'number') setParticipantCount(res.count)
    } catch { /* optional */ }
  }, [])

  async function openParticipantList() {
    setShowParticipants(true)
    if (!crawl?.id) return
    try {
      const res = await fetch(`/api/participants?crawl_id=${crawl.id}`).then(r => r.json())
      setParticipantNames(res.participants ?? [])
    } catch {
      setParticipantNames([])
    }
  }

  const fetchDrinks = useCallback(async (crawlId: string) => {
    const res = await fetch(`/api/drinks?crawl_id=${crawlId}`).then(r => r.json())
    setGroupDrinks(res.groupTotal ?? EMPTY_DRINK_TOTALS)
    setMyDrinks(res.myTotal ?? EMPTY_DRINK_TOTALS)
    setMyDrinksByPub(res.myByPub ?? {})
  }, [])

  // Prefills the rating widget with a participant's own previous submission,
  // so it doesn't appear blank (and default to overwriting) after a reload.
  const fetchMyRatings = useCallback(async (crawlId: string) => {
    try {
      const res = await fetch(`/api/ratings?crawl_id=${crawlId}`).then(r => r.json())
      setMyRatings(res.myRatings ?? {})
    } catch { /* optional */ }
  }, [])

  const fetchLeaderboard = useCallback(async (crawlId: string) => {
    try {
      const res = await fetch(`/api/drinks/leaderboard?crawl_id=${crawlId}`).then(r => r.json())
      setLeaderboard(res.leaderboard ?? [])
    } catch { /* optional feature */ }
  }, [])

  // Catches a broadcast that fired while this device was backgrounded/closed
  // and its realtime socket had dropped — phones locking or fully closing the
  // app mid-crawl silently kill the connection, so a live push made while away
  // is otherwise never seen, even after a fresh reload.
  const checkForMissedBroadcast = useCallback(async (crawlId: string) => {
    try {
      const res = await fetch(`/api/broadcast?crawl_id=${crawlId}`).then(r => r.json())
      const latest = res.broadcast as { id: string; message: string; created_at: string } | null
      if (!latest) return
      if (latest.id !== lastBroadcastIdRef.current) {
        lastBroadcastIdRef.current = latest.id
        const ageMs = Date.now() - new Date(latest.created_at).getTime()
        if (ageMs < 15 * 60 * 1000) {
          setBroadcast({ message: latest.message })
          if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current)
          broadcastTimerRef.current = setTimeout(() => setBroadcast(null), 10000)
        }
      }
    } catch { /* best-effort */ }
  }, [])

  const load = useCallback(async () => {
    try {
      const crawlRes = await fetch('/api/crawl').then(r => r.json())
      const crawlId: string | undefined = crawlRes.crawl?.id
      const [pubsRes, locRes] = await Promise.all([
        crawlId ? fetch(`/api/pubs?crawl_id=${crawlId}`).then(r => r.json()) : Promise.resolve({ pubs: [] }),
        crawlId ? fetch(`/api/location?crawl_id=${crawlId}`).then(r => r.json()) : Promise.resolve({ location: null, leaderLocations: [] }),
      ])
      if (crawlRes.crawl?.id) {
        fetch(`/api/leaders?crawl_id=${crawlRes.crawl.id}`)
          .then(r => r.json())
          .then(d => setLeaderNames((d.leaders ?? []).map((l: { name: string }) => l.name)))
          .catch(() => {})
      }
      const sortedPubs: Pub[] = (pubsRes.pubs ?? []).sort((a: Pub, b: Pub) => a.order_index - b.order_index)
      const allRatings: Rating[] = []
      for (const pub of sortedPubs) {
        const ratings = (pub as unknown as { ratings?: Rating[] }).ratings
        if (ratings) allRatings.push(...ratings)
      }
      const leaderLocs: LeaderLocation[] = locRes.leaderLocations ?? []

      setCrawl(crawlRes.crawl)
      setPubs(sortedPubs)
      setLocation(locRes.location)
      setLeaderLocations(leaderLocs)
      setRatings(allRatings)
      setIsOffline(false)
      if (crawlRes.crawl?.id) {
        fetchDrinks(crawlRes.crawl.id)
        fetchMyRatings(crawlRes.crawl.id)
        fetchParticipantCount(crawlRes.crawl.id)
        if (crawlRes.crawl.status === 'completed') fetchLeaderboard(crawlRes.crawl.id)
        checkForMissedBroadcast(crawlRes.crawl.id)
      }
      // Fetch weather from the first pub with coordinates
      const firstWithCoords = sortedPubs.find((p: Pub) => p.lat != null && p.lng != null)
      if (firstWithCoords?.lat && firstWithCoords?.lng) {
        fetchWeather(firstWithCoords.lat, firstWithCoords.lng)
      }

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          crawl: crawlRes.crawl,
          pubs: sortedPubs,
          location: locRes.location,
          leaderLocations: leaderLocs,
          ratings: allRatings,
        } satisfies CrawlCache))
      } catch { /* localStorage blocked (private browsing etc.) */ }
    } catch {
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const cache: CrawlCache = JSON.parse(raw)
          setCrawl(cache.crawl)
          setPubs(cache.pubs)
          setLocation(cache.location)
          setLeaderLocations(cache.leaderLocations)
          setRatings(cache.ratings)
          setIsOffline(true)
        } else {
          setLoadError(true)
        }
      } catch {
        setLoadError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [fetchDrinks, fetchMyRatings, fetchLeaderboard, fetchParticipantCount, fetchWeather, checkForMissedBroadcast])

  useEffect(() => {
    fetch('/api/auth/role').then(r => r.json()).then(d => {
      if (d.role === 'admin') {
        setIsAdmin(true)
        setViewMode('participant')
        setParticipantName('Ross')
      } else if (d.role === 'participant') {
        setViewMode('participant')
        setTab('list')
        if (d.name) setParticipantName(d.name)
      } else if (d.role === 'leader') {
        setViewMode('leader')
        setTab('list')
        if (d.name) setParticipantName(d.name)
      }
    }).catch(() => {})
    load()
  }, [load])

  useEffect(() => {
    if (crawl?.status === 'pending') setTab('list')
  }, [crawl?.status])

  // Background retry when offline
  useEffect(() => {
    if (!isOffline) return
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [isOffline, load])

  // Phones locking/backgrounding the tab can silently drop the realtime
  // connection — when that happens, no further pushes arrive until something
  // proactively refetches. Re-sync the instant the tab regains focus, plus a
  // periodic backup poll while visible in case the socket died silently
  // without ever backgrounding (e.g. flaky pub wifi).
  useEffect(() => {
    let lastRun = 0
    function refreshNow() {
      if (document.visibilityState !== 'visible') return
      // visibilitychange and focus typically fire together for the same
      // "tab became active" moment — collapse into a single refresh.
      const now = Date.now()
      if (now - lastRun < 2000) return
      lastRun = now
      load() // also checks for a missed broadcast once the crawl id resolves
    }
    document.addEventListener('visibilitychange', refreshNow)
    window.addEventListener('focus', refreshNow)
    const pollId = setInterval(refreshNow, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', refreshNow)
      window.removeEventListener('focus', refreshNow)
      clearInterval(pollId)
    }
  }, [load])

  // Real-time subscriptions
  useEffect(() => {
    if (!crawl?.id) return

    const pubsSub = supabase
      .channel('pubs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pubs', filter: `crawl_id=eq.${crawl.id}` }, payload => {
        setPubs(prev => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Pub].sort((a, b) => a.order_index - b.order_index)
          if (payload.eventType === 'UPDATE') return prev.map(p => p.id === payload.new.id ? payload.new as Pub : p)
          if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.id)
          return prev
        })
        // Crawl table isn't in the realtime publication, so refetch it whenever
        // pubs change — the admin always updates crawl status before touching pubs.
        fetch('/api/crawl').then(r => r.json()).then(d => { if (d.crawl) setCrawl(d.crawl) })
      })
      .subscribe()

    const locSub = supabase
      .channel('location-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_location', filter: `crawl_id=eq.${crawl.id}` }, payload => {
        if (payload.eventType !== 'DELETE') setLocation(payload.new as LiveLocation)
      })
      .subscribe()

    const leaderLocSub = supabase
      .channel('leader-location-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leader_locations', filter: `crawl_id=eq.${crawl.id}` }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          setLeaderLocations(prev => {
            const filtered = prev.filter(ll => ll.leader_id !== (payload.new as LeaderLocation).leader_id)
            return [...filtered, payload.new as LeaderLocation]
          })
        }
      })
      .subscribe()

    const ratingsSub = supabase
      .channel('ratings-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, payload => {
        setRatings(prev => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Rating]
          if (payload.eventType === 'UPDATE') return prev.map(r => r.id === payload.new.id ? payload.new as Rating : r)
          return prev
        })
      })
      .subscribe()

    const drinksSub = supabase
      .channel('drinks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drinks', filter: `crawl_id=eq.${crawl.id}` }, () => {
        fetchDrinks(crawl.id)
      })
      .subscribe()

    const broadcastSub = supabase
      .channel('broadcast-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts', filter: `crawl_id=eq.${crawl.id}` }, payload => {
        lastBroadcastIdRef.current = (payload.new as { id: string }).id
        const msg = (payload.new as { message: string }).message
        setBroadcast({ message: msg })
        if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current)
        broadcastTimerRef.current = setTimeout(() => setBroadcast(null), 10000)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(pubsSub)
      supabase.removeChannel(locSub)
      supabase.removeChannel(leaderLocSub)
      supabase.removeChannel(ratingsSub)
      supabase.removeChannel(drinksSub)
      supabase.removeChannel(broadcastSub)
    }
  }, [crawl?.id, fetchDrinks])

  // Refresh weather every 10 minutes
  useEffect(() => {
    if (!weather) return
    const id = setInterval(() => {
      const firstWithCoords = [...pubs].find(p => p.lat != null && p.lng != null)
      if (firstWithCoords?.lat && firstWithCoords?.lng) fetchWeather(firstWithCoords.lat, firstWithCoords.lng)
    }, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [weather, pubs, fetchWeather])

  async function submitRating(pubId: string, score: number, comment: string) {
    const res = await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pub_id: pubId, score, comment }),
    })
    if (res.ok) {
      const { rating } = await res.json()
      setMyRatings(prev => ({ ...prev, [pubId]: rating }))
    }
  }

  const currentPub = pubs.find(p => p.status === 'current') ?? null
  const nextPub = pubs.find(p => p.status === 'upcoming') ?? null
  const isParticipantLike = viewMode === 'participant' || viewMode === 'leader'

  // Show a banner when the group moves to a new pub mid-session (not on initial page load)
  useEffect(() => {
    if (loading) return
    const id = currentPub?.id ?? null
    if (prevPubIdRef.current === undefined) {
      prevPubIdRef.current = id
      return
    }
    if (id && id !== prevPubIdRef.current) {
      setPubBanner(currentPub!.name)
      if (isParticipantLike) setArrivalModal({ pubName: currentPub!.name, pubId: currentPub!.id })
      prevPubIdRef.current = id
      const timer = setTimeout(() => setPubBanner(null), 6000)
      return () => clearTimeout(timer)
    }
    prevPubIdRef.current = id
  }, [currentPub?.id, currentPub?.name, loading])

  // Dwell countdown — ticks every second while at current pub
  useEffect(() => {
    if (!currentPub?.actual_arrival_at || !currentPub?.planned_dwell_minutes) {
      setDwellMs(null)
      return
    }
    const deadline = new Date(currentPub.actual_arrival_at).getTime() + currentPub.planned_dwell_minutes * 60 * 1000
    const tick = () => setDwellMs(deadline - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [currentPub?.actual_arrival_at, currentPub?.planned_dwell_minutes])
  const sortedPubs = [...pubs].sort((a, b) => a.order_index - b.order_index)
  const isEnRoute = crawl?.status === 'active' && !currentPub && sortedPubs.some(p => p.status === 'visited')
  const isLastPub = currentPub ? currentPub.id === sortedPubs[sortedPubs.length - 1]?.id : false

  const recapData: RecapData | null = crawl ? (() => {
    const visited = sortedPubs.filter(p => p.status === 'visited' || p.status === 'current')
    // Exclude the current (not-yet-departed) pub — its ratings stay hidden
    // until the group moves on, so it can't win "best rated" prematurely.
    const bestPub = visited.filter(p => p.status === 'visited').reduce<{ name: string; avg: number } | null>((best, pub) => {
      const pubRatings = ratings.filter(r => r.pub_id === pub.id)
      if (!pubRatings.length) return best
      const avg = pubRatings.reduce((s, r) => s + r.score, 0) / pubRatings.length
      return !best || avg > best.avg ? { name: pub.name, avg } : best
    }, null)
    const topDrinker = leaderboard.length > 0 ? { name: leaderboard[0].name, total: leaderboard[0].total } : null
    return {
      crawlName: crawl.name,
      date: crawl.date,
      pubsVisited: visited.length,
      totalPubs: sortedPubs.length,
      groupDrinks,
      bestPub,
      topDrinker,
      myDrinks: isParticipantLike ? myDrinks : undefined,
      participantName: isParticipantLike ? participantName : undefined,
    }
  })() : null

  // Calculate planned arrival times for all pubs from the crawl start time
  const scheduledTimes: Map<string, Date> = useMemo(() => {
    if (!crawl?.start_time || !crawl?.date) return new Map()
    const [h, m] = crawl.start_time.split(':').map(Number)
    const startDate = new Date(crawl.date + 'T00:00:00')
    startDate.setHours(h, m, 0, 0)
    return calculateScheduleFixed([...pubs].sort((a, b) => a.order_index - b.order_index), startDate)
  }, [crawl?.start_time, crawl?.date, pubs])

  // Prefer DB planned_arrival_at (kept fresh by server-side refreshETAs on each
  // departure) over the static schedule fallback.
  const effectiveSchedule: Map<string, Date> = useMemo(() => {
    const m = new Map<string, Date>()
    for (const pub of sortedPubs) {
      const t = pub.planned_arrival_at ? new Date(pub.planned_arrival_at) : scheduledTimes.get(pub.id)
      if (t) m.set(pub.id, t)
    }
    return m
  }, [sortedPubs, scheduledTimes])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-orange-500 to-rose-500">
        <div className="text-4xl mb-4">🎉</div>
        <Beer className="w-8 h-8 text-white animate-bounce" />
        <p className="text-white/80 text-sm font-medium mt-3 tracking-wide">Loading the crawl…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-orange-500 to-rose-500 px-6 text-center">
        <div className="text-4xl mb-4">📡</div>
        <p className="text-white font-bold text-lg">Can't reach the server</p>
        <p className="text-white/70 text-sm mt-2">Make sure your phone is on the same WiFi as the host Mac, then tap below.</p>
        <button
          onClick={() => { setLoadError(false); setLoading(true); load() }}
          className="mt-6 bg-white text-orange-600 font-bold px-6 py-3 rounded-full text-sm"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full">
      {isOffline && (
        <div className="sticky top-0 z-40 bg-amber-500 text-white text-center text-xs font-semibold px-4 py-2">
          You're offline — showing last known info
        </div>
      )}
      <div className="sticky top-0 z-30">
        <header className="bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">🎉 {crawl?.subtitle || "Jack's 30th Birthday"}</p>
            <div className="flex items-center gap-1">
              {isAdmin ? (
                <a href="/admin">
                  <Button size="sm" variant="ghost" className="text-white hover:bg-white/15 p-1.5 -mr-1 flex items-center gap-1">
                    <Settings className="w-4 h-4" />
                    <span className="text-xs font-semibold">Admin</span>
                  </Button>
                </a>
              ) : viewMode === 'leader' ? (
                <a href="/leader">
                  <Button size="sm" variant="ghost" className="text-white/60 hover:bg-white/15 hover:text-white p-1.5 -mr-1">
                    <Settings className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button size="sm" variant="ghost" onClick={handleShare} className="text-white/70 hover:bg-white/15 hover:text-white p-1.5 -mr-1 flex items-center gap-1">
                  {shareCopied ? <span className="text-xs font-semibold">Copied!</span> : <><Share2 className="w-4 h-4" /><span className="text-xs font-semibold">Share</span></>}
                </Button>
              )}
            </div>
          </div>
          <div className="px-4 pb-3 flex items-end justify-between">
            <div>
              <h1 className="font-black text-2xl leading-tight">{crawl?.name ?? 'Thames Pub Crawl'}</h1>
              {isParticipantLike ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                    🍺 {participantName ?? 'On the crawl'}
                  </span>
                </div>
              ) : crawl?.status === 'pending' && crawl.date ? (
                <p className="text-xs text-white/70 mt-0.5">
                  {new Date(crawl.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {crawl.start_time ? ` · ${crawl.start_time.slice(0, 5)}` : ''}
                </p>
              ) : (
                <p className="text-xs text-white/60 mt-0.5">Spectator view</p>
              )}
              {/* Weather + headcount chips */}
              {(weather || participantCount !== null) && (
                <div className="flex items-center gap-2 mt-1.5">
                  {weather && (
                    <span className="bg-white/15 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                      {weather.emoji} {weather.temp}°C
                    </span>
                  )}
                  {participantCount !== null && participantCount > 0 && (
                    <button
                      onClick={openParticipantList}
                      className="bg-white/15 hover:bg-white/25 transition-colors text-white text-xs font-medium px-2 py-0.5 rounded-full"
                    >
                      👥 {participantCount} {participantCount === 1 ? 'person' : 'people'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <StatusBar
            crawl={crawl}
            currentPub={currentPub}
            nextPub={nextPub}
            leaderLocations={leaderLocations}
            scheduledNextTime={nextPub ? effectiveSchedule.get(nextPub.id) : null}
          />
        </div>

        {crawl?.status === 'active' && (totalDrinks(groupDrinks) > 0 || isParticipantLike) && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 text-sm font-medium text-amber-800 flex-wrap">
              {DRINK_TYPES.filter(({ key }) => groupDrinks[key] > 0).map(({ key, emoji }) => (
                <span key={key}>{emoji} {groupDrinks[key]}</span>
              ))}
              <span className="text-amber-400 text-xs font-normal">group total</span>
            </div>
            {isParticipantLike && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <span>
                  you: {DRINK_TYPES.filter(({ key }) => myDrinks[key] > 0).map(({ key, emoji }) => `${emoji} ${myDrinks[key]}`).join(' ') || 'nothing yet'}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="px-3 py-1.5 bg-white border-b border-gray-100">
          <Tabs value={tab} onValueChange={v => setTab(v as TabMode)}>
            <TabsList className="w-full bg-gray-100">
              <TabsTrigger value="map" className="flex-1 gap-1.5 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
                <MapIcon className="w-4 h-4" /> Map
              </TabsTrigger>
              <TabsTrigger value="list" className="flex-1 gap-1.5 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
                <List className="w-4 h-4" /> Pubs ({pubs.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className={`flex-1 pb-6 ${crawl?.status === 'active' && currentPub ? 'pb-24' : 'pb-6'}`}>
        {crawl?.status === 'completed' ? (
          <div className="px-3 py-4 space-y-4">
            {/* Hero */}
            <div className="bg-gradient-to-br from-orange-500 to-rose-500 rounded-3xl px-6 py-8 text-center text-white shadow-lg">
              <div className="text-5xl mb-3">🏁</div>
              <h2 className="font-black text-3xl leading-tight">What a night!</h2>
              <p className="text-white/70 text-sm mt-2">{crawl.name} · complete</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pubs', value: sortedPubs.filter(p => p.status === 'visited').length },
                ...DRINK_TYPES.map(({ key, label }) => ({
                  label,
                  value: groupDrinks[key] % 1 !== 0 ? groupDrinks[key].toFixed(1) : groupDrinks[key],
                })),
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-2xl p-3 text-center shadow-sm border border-gray-100">
                  <p className="text-2xl font-black text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Pub breakdown */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 pt-3 pb-2 border-b border-gray-50">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Pub breakdown</p>
              </div>
              {sortedPubs.filter(p => p.status === 'visited').map((pub, i) => {
                const pubRatings = ratings.filter(r => r.pub_id === pub.id)
                const avg = pubRatings.length > 0 ? pubRatings.reduce((s, r) => s + r.score, 0) / pubRatings.length : null
                const arrival = pub.actual_arrival_at ? new Date(pub.actual_arrival_at) : null
                const departure = pub.actual_departure_at ? new Date(pub.actual_departure_at) : null
                const dwellMins = arrival && departure ? Math.round((departure.getTime() - arrival.getTime()) / 60000) : null
                return (
                  <div key={pub.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{pub.name}</p>
                      <p className="text-xs text-gray-400">
                        {arrival ? arrival.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        {dwellMins ? ` · ${dwellMins}min` : ''}
                      </p>
                    </div>
                    {avg !== null && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-amber-400">★</span>
                        <span className="text-sm font-bold text-gray-700">{avg.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Drink leaderboard */}
            {leaderboard.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-gray-50">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Drink leaderboard</p>
                </div>
                {leaderboard.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-400'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{entry.name}</p>
                      <p className="text-xs text-gray-400">
                        {DRINK_TYPES.filter(({ key }) => entry[key] > 0).map(({ key, emoji }) => `${emoji} ${entry[key]}`).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <span className="text-sm font-black text-gray-900">{entry.total}</span>
                      <span className="text-xs text-gray-400 ml-0.5">drinks</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {tab === 'map' && (
              <>
                <div className="h-[55vh] w-full">
                  <CrawlMap
                    pubs={pubs}
                    location={location}
                    leaderLocations={leaderLocations}
                    scheduledTimes={effectiveSchedule}
                  />
                </div>
                {viewMode === 'spectator' && leaderLocations.length > 0 && !leaderHintDismissed && (
                  <div className="mx-3 mt-3 flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3">
                    <span className="text-base mt-0.5 shrink-0">📡</span>
                    <p className="text-xs text-blue-700 leading-relaxed flex-1">
                      Leader locations only update while they have the app open — tap a marker to see when it was last updated.
                    </p>
                    <button
                      onClick={() => setLeaderHintDismissed(true)}
                      className="text-blue-400 hover:text-blue-600 text-lg leading-none shrink-0 -mt-0.5"
                      aria-label="Dismiss"
                    >×</button>
                  </div>
                )}
              </>
            )}

            {tab === 'list' && (
              <>
                {crawl?.status === 'pending' && viewMode === 'spectator' && (
                  <div className="mx-3 mt-3 flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                    <Users className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {leaderNames.length > 0
                        ? <>When you arrive at the first pub, scan the QR code from <span className="font-semibold">{leaderNames.slice(0, -1).join(', ')}{leaderNames.length > 1 ? ' or ' : ''}{leaderNames[leaderNames.length - 1]}</span> to join the crawl.</>
                        : <>When you arrive at the first pub, scan the QR code from <span className="font-semibold">Ross</span> to join the crawl.</>
                      }
                    </p>
                  </div>
                )}

                {crawl?.status === 'pending' && sortedPubs.length > 0 && (
                  <div className="mx-3 mt-3 mb-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-4 pt-3 pb-2 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Today&apos;s route</p>
                      <p className="text-[10px] text-gray-400">{sortedPubs.length} stops</p>
                    </div>
                    <div className="px-4 pt-3 pb-1">
                      {sortedPubs.map((pub, i) => {
                        const t = effectiveSchedule.get(pub.id)
                        const isFirst = i === 0
                        const isLast = i === sortedPubs.length - 1
                        return (
                          <div key={pub.id} className="flex gap-3">
                            {/* Timeline spine */}
                            <div className="flex flex-col items-center w-4 shrink-0">
                              <div className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 ${isFirst ? 'bg-orange-500 ring-2 ring-orange-100' : isLast ? 'bg-rose-500 ring-2 ring-rose-100' : 'bg-orange-300'}`} />
                              {!isLast && <div className="w-0.5 bg-orange-100 flex-1 min-h-[2.5rem] my-1" />}
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0 pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{pub.name}</p>
                                    {isFirst && <span className="text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full shrink-0">Start</span>}
                                    {isLast && <span className="text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full shrink-0">Finish</span>}
                                  </div>
                                  <p className="text-xs text-orange-500 font-medium mt-0.5">{pub.planned_dwell_minutes} min drink time</p>
                                  {!isLast && pub.walking_minutes_to_next && (
                                    <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                                      🚶 {pub.walking_minutes_to_next} min walk
                                    </p>
                                  )}
                                </div>
                                {t && (
                                  <div className="text-right shrink-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Arrive</p>
                                    <p className="text-sm font-bold text-gray-800 tabular-nums">
                                      {t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* Spectator: where are they now + next stop */}
                {crawl?.status === 'active' && viewMode === 'spectator' && (
                  <div className="px-3 pt-3 space-y-2">
                    {currentPub && (() => {
                      const totalMs = currentPub.planned_dwell_minutes * 60 * 1000
                      const progress = dwellMs !== null ? Math.min(100, Math.max(0, ((totalMs - dwellMs) / totalMs) * 100)) : 0
                      const overtime = dwellMs !== null && dwellMs < 0
                      return (
                        <div className="bg-gradient-to-br from-orange-500 to-rose-500 rounded-2xl p-4 text-white shadow-md">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">They&apos;re currently at</p>
                          <p className="font-black text-xl mt-0.5 leading-tight">{currentPub.name}</p>
                          {currentPub.address && <p className="text-xs text-white/60 mt-0.5">{currentPub.address}</p>}
                          {isLastPub ? (
                            <p className="text-xs text-white/70 mt-3">🏁 Final stop — no rush!</p>
                          ) : dwellMs !== null && (
                            <div className="mt-3">
                              <p className="text-xs text-white/70 mb-1.5">
                                {overtime ? '⏰ Running over time' : `~${formatDuration(Math.abs(dwellMs))} drink time left`}
                              </p>
                              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-white/70 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          )}
                          {currentPub.lat && currentPub.lng && (
                            <a
                              href={`https://maps.google.com/maps?daddr=${currentPub.lat},${currentPub.lng}`}
                              target="_blank" rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-full"
                            >
                              <Navigation className="w-3 h-3" /> Get directions
                            </a>
                          )}
                        </div>
                      )
                    })()}

                    {nextPub && (() => {
                      const nextTime = effectiveSchedule.get(nextPub.id)
                      return (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1.5">{isEnRoute ? 'En route to' : 'Next stop'}</p>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-gray-800 truncate">{nextPub.name}</p>
                              {nextTime && (
                                <p className="text-sm text-orange-500 font-medium mt-0.5">
                                  Arriving ~{nextTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                              <p className="text-xs text-gray-400 mt-0.5">{nextPub.planned_dwell_minutes} min drink time</p>
                            </div>
                            {nextPub.lat && nextPub.lng && (
                              <a
                                href={`https://maps.google.com/maps?daddr=${nextPub.lat},${nextPub.lng}`}
                                target="_blank" rel="noopener noreferrer"
                                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl"
                              >
                                <Navigation className="w-3 h-3" /> Meet them there
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })()}

                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                      <Users className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Not joined yet? When you arrive at this pub, scan the QR code from
                        {leaderNames.length > 0
                          ? ` ${leaderNames.slice(0, -1).join(', ')}${leaderNames.length > 1 ? ' or ' : ''}${leaderNames[leaderNames.length - 1]}`
                          : ' Ross'
                        } to join.
                      </p>
                    </div>
                  </div>
                )}

                {/* Last pub CTA */}
                {crawl?.status === 'active' && isLastPub && isParticipantLike && (
                  <div className="mx-3 mt-3 bg-gradient-to-br from-violet-500 to-rose-500 rounded-2xl p-4 text-white shadow-md">
                    <p className="font-black text-lg leading-tight">🏁 Final stop!</p>
                    <p className="text-sm text-white/80 mt-1 leading-relaxed">Log your drinks and leave a rating before we wrap up — your scores lock in when the crawl ends.</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => {
                          const el = document.getElementById(`pub-card-${currentPub?.id}`)
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-4 py-2 rounded-full"
                      >
                        Log drinks & rate 🍺
                      </button>
                      <button
                        onClick={() => {
                          if (crawl?.id) fetchLeaderboard(crawl.id)
                          setShowStats(true)
                        }}
                        className="bg-white text-violet-700 text-sm font-semibold px-4 py-2 rounded-full"
                      >
                        View all stats 📊
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 px-3 mt-3">
                  {sortedPubs.map((pub, i) => (
                    <PubCard
                      key={pub.id}
                      pub={pub}
                      index={i}
                      ratings={ratings.filter(r => r.pub_id === pub.id)}
                      isParticipant={isParticipantLike}
                      myRating={myRatings[pub.id]}
                      onRate={submitRating}
                      scheduledTime={effectiveSchedule.get(pub.id)}
                      crawlId={crawl?.id}
                      myDrinks={myDrinksByPub[pub.id]}
                      isEnRoute={isEnRoute && pub.id === nextPub?.id}
                      isLocked={sortedPubs.slice(i + 1).some(p => p.status === 'current' || p.status === 'visited')}
                      crawlStarted={crawl?.status !== 'pending'}
                    />
                  ))}
                  {pubs.length === 0 && (
                    <p className="text-center text-gray-500 py-10">No pubs added yet</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Full-screen arrival modal */}
      {arrivalModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="bg-linear-to-br from-green-400 to-emerald-600 px-6 pt-8 pb-6 text-center">
              <div className="text-6xl mb-3">🍺</div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-100 mb-1">You've arrived!</p>
              <p className="font-black text-2xl text-white leading-tight">{arrivalModal.pubName}</p>
            </div>
            <div className="px-6 py-5 text-center space-y-4">
              <p className="text-gray-600 text-sm leading-relaxed">
                You can now <span className="font-semibold text-gray-800">rate this pub</span> and <span className="font-semibold text-gray-800">log your drinks</span> — tap below to get started.
              </p>
              <Button
                className="w-full bg-linear-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-bold py-3 rounded-2xl border-0 text-base h-auto"
                onClick={() => {
                  setTab('list')
                  setArrivalModal(null)
                }}
              >
                Rate & log drinks →
              </Button>
              <button
                onClick={() => setArrivalModal(null)}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participants list modal */}
      {showParticipants && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5"
          onClick={e => { if (e.target === e.currentTarget) setShowParticipants(false) }}
        >
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[75vh] flex flex-col">
            <div className="bg-gradient-to-r from-orange-500 to-rose-500 px-6 py-5 text-center shrink-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-1">On the crawl</p>
              <p className="font-black text-2xl text-white leading-tight">
                {participantNames === null ? '…' : `${participantNames.length} ${participantNames.length === 1 ? 'person' : 'people'}`}
              </p>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              {participantNames === null ? (
                <p className="text-center text-sm text-gray-400 py-4">Loading…</p>
              ) : participantNames.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">Nobody's joined yet.</p>
              ) : (
                <ul className="space-y-2">
                  {participantNames.map((name, i) => (
                    <li key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5">
                      <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-semibold text-gray-800 truncate">{name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-6 pb-5 pt-1 shrink-0">
              <button
                onClick={() => setShowParticipants(false)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats modal */}
      {showStats && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowStats(false) }}
        >
          <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-br from-violet-500 to-rose-500 px-6 pt-6 pb-5 text-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">End of crawl</p>
                  <p className="font-black text-2xl leading-tight">Stats 📊</p>
                </div>
                <button onClick={() => setShowStats(false)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-lg">×</button>
              </div>
              {/* Tab toggle */}
              {isParticipantLike && (
                <div className="flex bg-white/15 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setStatsTab('my')}
                    className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-all ${statsTab === 'my' ? 'bg-white text-violet-700' : 'text-white/80 hover:text-white'}`}
                  >
                    My stats
                  </button>
                  <button
                    onClick={() => setStatsTab('group')}
                    className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-all ${statsTab === 'group' ? 'bg-white text-violet-700' : 'text-white/80 hover:text-white'}`}
                  >
                    Group stats
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-6">
              {/* MY STATS */}
              {(!isParticipantLike || statsTab === 'my') && isParticipantLike && (
                <>
                  {/* My totals */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Your totals</p>
                    <div className="grid grid-cols-3 gap-3">
                      {DRINK_TYPES.map(({ key, emoji, label }) => (
                        <div key={key} className="bg-violet-50 rounded-2xl p-3 text-center">
                          <p className="text-2xl mb-1">{emoji}</p>
                          <p className="font-black text-xl text-gray-900">{myDrinks[key]}</p>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                        </div>
                      ))}
                    </div>
                    {viewMode === 'participant' && !isAdmin && (
                      <button
                        onClick={leaveCrawl}
                        className="w-full text-center text-xs text-gray-400 hover:text-gray-600 mt-3"
                      >
                        I've left the crawl
                      </button>
                    )}
                  </div>

                  {/* My pub breakdown */}
                  {sortedPubs.filter(p => p.status === 'visited' || p.status === 'current').length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Pub by pub</p>
                      <div className="space-y-2">
                        {sortedPubs.filter(p => p.status === 'visited' || p.status === 'current').map((pub, i) => {
                          const myPubDrinks = myDrinksByPub[pub.id]
                          const myRating = myRatings[pub.id]
                          const hasDrinks = myPubDrinks && hasAnyDrinks(myPubDrinks)
                          return (
                            <div key={pub.id} className="bg-gray-50 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-black text-gray-300 w-5 shrink-0">{i + 1}</span>
                                <span className="flex-1 font-semibold text-gray-900 truncate">{pub.name}</span>
                                {myRating && (
                                  <div className="flex gap-0.5 shrink-0">
                                    {[1,2,3,4,5].map(s => (
                                      <svg key={s} className={`w-3 h-3 ${s <= myRating.score ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {hasDrinks && (
                                <div className="flex gap-3 text-sm text-gray-500 mt-1.5 ml-8 flex-wrap">
                                  {DRINK_TYPES.filter(({ key }) => myPubDrinks[key] > 0).map(({ key, emoji }) => (
                                    <span key={key}>{emoji}{myPubDrinks[key]}</span>
                                  ))}
                                </div>
                              )}
                              {myRating?.comment && (
                                <p className="text-xs text-gray-400 italic mt-1 ml-8 whitespace-pre-wrap">"{myRating.comment}"</p>
                              )}
                              {!hasDrinks && !myRating && (
                                <p className="text-xs text-gray-400 mt-1 ml-8">Nothing logged</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* GROUP STATS */}
              {(!isParticipantLike || statsTab === 'group') && (
                <>
                  {/* Group drink totals */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Group totals</p>
                    <div className="grid grid-cols-3 gap-3">
                      {DRINK_TYPES.map(({ key, emoji, label }) => (
                        <div key={key} className="bg-gray-50 rounded-2xl p-3 text-center">
                          <p className="text-2xl mb-1">{emoji}</p>
                          <p className="font-black text-xl text-gray-900">{groupDrinks[key]}</p>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leaderboard */}
                  {leaderboard.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Drinks leaderboard</p>
                      <div className="space-y-2">
                        {leaderboard.map((entry, i) => (
                          <div key={entry.name} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                            <span className={`text-sm font-black w-6 shrink-0 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-700' : 'text-gray-300'}`}>
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                            </span>
                            <span className="flex-1 font-semibold text-gray-900 truncate">{entry.name}</span>
                            <div className="flex gap-3 text-sm text-gray-600 shrink-0 flex-wrap">
                              {DRINK_TYPES.filter(({ key }) => entry[key] > 0).map(({ key, emoji }) => (
                                <span key={key}>{emoji}{entry[key]}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pub ratings */}
                  {sortedPubs.filter(p => p.status === 'visited' || p.status === 'current').length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Pub ratings</p>
                      <div className="space-y-2">
                        {sortedPubs.filter(p => p.status === 'visited' || p.status === 'current').map((pub, i) => {
                          const pubRatings = ratings.filter(r => r.pub_id === pub.id)
                          const avg = pubRatings.length > 0 ? pubRatings.reduce((s, r) => s + r.score, 0) / pubRatings.length : null
                          return (
                            <div key={pub.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                              <span className="text-sm font-black text-gray-300 w-6 shrink-0">{i + 1}</span>
                              <span className="flex-1 font-semibold text-gray-900 truncate">{pub.name}</span>
                              {pub.status === 'current' ? (
                                <span className="text-xs text-gray-400 italic shrink-0">Awaiting reviews</span>
                              ) : avg !== null ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  {[1,2,3,4,5].map(s => (
                                    <svg key={s} className={`w-3.5 h-3.5 ${s <= Math.round(avg) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`} viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                                  ))}
                                  <span className="text-xs text-gray-500 ml-1">{avg.toFixed(1)}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 shrink-0">No ratings</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Recap card button */}
            {recapData && (
              <div className="shrink-0 px-5 pb-5 pt-2 border-t border-gray-100">
                <button
                  onClick={() => {
                    if (crawl?.id) fetchLeaderboard(crawl.id)
                    setShowStats(false)
                    setShowRecap(true)
                  }}
                  className="w-full bg-gradient-to-r from-violet-500 to-rose-500 text-white font-bold py-3 rounded-2xl text-sm"
                >
                  Generate recap card 🎉
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recap card */}
      {showRecap && recapData && (
        <RecapCard data={recapData} onClose={() => setShowRecap(false)} />
      )}

      {/* Pub arrival banner — slides in when the group moves to a new pub */}
      {pubBanner && (
        <div
          className="fixed top-4 left-4 right-4 z-[2000] flex justify-center pointer-events-none"
          style={{ animation: 'slideDown 0.3s ease-out' }}
        >
          <button
            onClick={() => setPubBanner(null)}
            className="pointer-events-auto w-full max-w-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 text-left"
          >
            <span className="text-4xl">🍺</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-green-100">
                {isParticipantLike ? "We've arrived!" : 'The group has arrived!'}
              </p>
              <p className="font-black text-xl leading-tight truncate">{pubBanner}</p>
              <p className="text-xs text-green-200 mt-0.5">Tap to dismiss</p>
            </div>
          </button>
        </div>
      )}

      {/* Broadcast overlay */}
      {broadcast && (
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center px-6"
          style={{ animation: 'slideDown 0.4s ease-out' }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setBroadcast(null)} />
          {/* Card */}
          <div className="relative w-full max-w-sm bg-gradient-to-br from-orange-500 to-rose-600 rounded-3xl shadow-2xl p-8 text-center text-white">
            <div className="text-5xl mb-4">📢</div>
            <p className="text-xl font-bold leading-snug">{broadcast.message}</p>
            <button
              onClick={() => setBroadcast(null)}
              className="mt-6 bg-white/20 hover:bg-white/30 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-colors"
            >
              Got it 👍
            </button>
          </div>
        </div>
      )}

      {/* Dwell countdown — sticky bottom bar while at a pub (not shown at the
          final stop, since nobody's moving on from there) */}
      {crawl?.status === 'active' && currentPub && !isLastPub && dwellMs !== null && (() => {
        const totalMs = currentPub.planned_dwell_minutes * 60 * 1000
        const elapsed = totalMs - dwellMs
        const progress = Math.min(100, Math.max(0, (elapsed / totalMs) * 100))
        const overtime = dwellMs < 0

        return (
          <div className="fixed bottom-0 left-0 right-0 z-20 shadow-lg">
            <div className={`px-4 pt-3 pb-3 flex items-center justify-between gap-4 ${overtime ? 'bg-rose-600' : 'bg-gradient-to-r from-orange-500 to-rose-500'}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                  {overtime ? 'Overtime!' : 'Time remaining'}
                </p>
                <p className="font-black text-2xl text-white tabular-nums leading-tight">
                  {overtime ? `+${formatDuration(Math.abs(dwellMs))}` : formatDuration(dwellMs)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">at</p>
                <p className="text-sm font-bold text-white">{currentPub.name}</p>
              </div>
            </div>
            <div className="h-1 bg-black/20">
              <div
                className="h-full bg-white/60 transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )
      })()}

      <WelcomeModal crawlName={crawl?.name} subtitle={crawl?.subtitle} />
    </div>
  )
}
