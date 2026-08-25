'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Beer, CheckCircle, CheckCircle2, ArrowRight, MapPin, Clock, ExternalLink, Radio, WifiOff, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import DwellAdjuster from '@/components/DwellAdjuster'
import type { Crawl, Pub } from '@/lib/types'

function JoinQRModal({ url, onClose }: { url: string; onClose: () => void }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Participant QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <img src={qrUrl} alt="Join QR Code" className="w-64 h-64 border rounded-lg" />
          <p className="text-xs text-parchment text-center break-all">{url}</p>
          <Button onClick={() => navigator.clipboard.writeText(url).catch(() => {})} variant="outline" size="sm">
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function LeaderPage() {
  const router = useRouter()
  const [leaderName, setLeaderName] = useState('')
  const [leaderToken, setLeaderToken] = useState('')
  const [crawl, setCrawl] = useState<Crawl | null>(null)
  const [pubs, setPubs] = useState<Pub[]>([])
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [showJoinQr, setShowJoinQr] = useState(false)
  const [networkHost, setNetworkHost] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const watchRef = useRef<number | null>(null)
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null)

  const load = useCallback(async () => {
    const crawlRes = await fetch('/api/crawl').then(r => r.json())
    const pubsRes = crawlRes.crawl?.id
      ? await fetch(`/api/pubs?crawl_id=${crawlRes.crawl.id}`).then(r => r.json())
      : { pubs: [] }
    setCrawl(crawlRes.crawl)
    setPubs((pubsRes.pubs ?? []).sort((a: Pub, b: Pub) => a.order_index - b.order_index))
    return crawlRes.crawl as Crawl | null
  }, [])

  function startTrackingWithContext(token: string, crawlData: Crawl) {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.')
      return
    }
    setTrackingLocation(true)
    setGpsError(null)
    localStorage.setItem('leader_tracking', '1')
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        latestPosRef.current = { lat, lng }
        fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-leader-token': token },
          body: JSON.stringify({ crawl_id: crawlData.id, lat, lng }),
        })
      },
      err => {
        setTrackingLocation(false)
        localStorage.removeItem('leader_tracking')
        if (!window.isSecureContext) {
          setGpsError('GPS requires a secure connection (HTTPS). Ask the crawl organiser for the HTTPS link.')
        } else if (err.code === 1) {
          setGpsError('Location access denied. Allow it in your browser settings and try again.')
        } else if (err.code === 2) {
          setGpsError('Location unavailable. Try again in a moment.')
        } else {
          setGpsError('Could not get your location. Please try again.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  useEffect(() => {
    fetch('/api/host').then(r => r.json()).then(d => setNetworkHost(d.host ?? null))
  }, [])

  function baseUrl() {
    if (networkHost) return `http://${networkHost}`
    return typeof window !== 'undefined' ? window.location.origin : ''
  }

  useEffect(() => {
    fetch('/api/auth/role').then(r => r.json()).then(async d => {
      if (d.role !== 'leader') {
        router.replace('/')
        return
      }
      setLeaderName(d.name)
      setLeaderToken(d.token)
      const crawlData = await load()
      setLoading(false)
      // Restart GPS if it was active before this page load
      if (crawlData && localStorage.getItem('leader_tracking') === '1') {
        startTrackingWithContext(d.token, crawlData)
      }
    })
  }, [load, router])

  async function markArrived(pub: Pub) {
    const prevCurrent = pubs.find(p => p.status === 'current' && p.id !== pub.id)
    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-leader-token': leaderToken },
      body: JSON.stringify({ id: pub.id, status: 'current', actual_arrival_at: new Date().toISOString() }),
    })
    if (prevCurrent) {
      await fetch('/api/pubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-leader-token': leaderToken },
        body: JSON.stringify({ id: prevCurrent.id, status: 'visited', actual_departure_at: new Date().toISOString() }),
      })
    }
    await load()
  }

  async function markDeparted(pub: Pub) {
    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-leader-token': leaderToken },
      body: JSON.stringify({ id: pub.id, status: 'visited', actual_departure_at: new Date().toISOString() }),
    })
    await load()
  }

  function startLocationTracking() {
    if (!crawl) return
    startTrackingWithContext(leaderToken, crawl)
  }

  function stopLocationTracking() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    latestPosRef.current = null
    setTrackingLocation(false)
    localStorage.removeItem('leader_tracking')
    setGpsError(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-copper/10">
        <Beer className="w-8 h-8 text-copper-bright animate-bounce" />
      </div>
    )
  }

  const currentPub = pubs.find(p => p.status === 'current') ?? null
  const nextPub = pubs.find(p => p.status === 'upcoming') ?? null
  const isLastPub = currentPub ? currentPub.id === pubs[pubs.length - 1]?.id : false

  return (
    <div className="min-h-screen bg-ink max-w-lg mx-auto pb-10">
      {/* Header */}
      <header className="bg-gradient-to-b from-ember to-copper-bright text-cream px-4 pt-5 pb-5 sticky top-0 z-10 shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Beer className="w-7 h-7 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-xl leading-tight block">Hi, {leaderName}!</span>
              <p className="text-cream/70 text-sm mt-0.5">{crawl?.name ?? 'Pub Crawl'} · Leader</p>
            </div>
          </div>
          <a href="/">
            <Button size="sm" variant="ghost" className="text-cream/70 hover:bg-copper-dim gap-1 text-xs mt-0.5">
              <ExternalLink className="w-3.5 h-3.5" /> View app
            </Button>
          </a>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* Hero action card — current pub */}
        {currentPub && (
          <Card className="ring-2 ring-sage/40 shadow-md overflow-hidden">
            <div className="bg-sage px-4 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-surface-raised animate-pulse" />
              <span className="text-cream text-sm font-semibold tracking-wide">We&apos;re here!</span>
            </div>
            <CardContent className="pt-4 pb-4">
              <p className="font-bold text-lg text-cream leading-tight">{currentPub.name}</p>
              {currentPub.address && (
                <p className="text-sm text-parchment flex items-center gap-1 mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />{currentPub.address}
                </p>
              )}
              {!isLastPub && (
                <DwellAdjuster
                  pub={currentPub}
                  authHeader={{ key: 'x-leader-token', value: leaderToken }}
                  onUpdate={updated => setPubs(prev => prev.map(p => p.id === updated.id ? updated : p))}
                />
              )}
              <Button
                variant="outline"
                className="mt-3 gap-1.5 text-copper-bright border-copper/25 hover:bg-copper/8 rounded-full px-5"
                onClick={() => markDeparted(currentPub)}
              >
                <ArrowRight className="w-4 h-4" /> Mark departed
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Hero action card — next pub */}
        {nextPub && !currentPub && (
          <Card className="shadow-md overflow-hidden">
            <div className="bg-copper px-4 py-2">
              <span className="text-cream text-sm font-semibold tracking-wide">Next stop</span>
            </div>
            <CardContent className="pt-4 pb-4">
              <p className="font-bold text-xl text-cream leading-tight">{nextPub.name}</p>
              {nextPub.address && (
                <p className="text-sm text-parchment flex items-center gap-1 mt-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />{nextPub.address}
                </p>
              )}
              {nextPub.planned_dwell_minutes && (
                <p className="text-xs text-parchment-dim flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />{nextPub.planned_dwell_minutes} min planned
                </p>
              )}
              <Button
                className="mt-4 w-full bg-sage hover:bg-sage-dim text-cream gap-2 rounded-full text-base py-5"
                onClick={() => markArrived(nextPub)}
              >
                <MapPin className="w-5 h-5" /> Mark arrived
              </Button>
            </CardContent>
          </Card>
        )}

        {/* GPS card */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {trackingLocation ? (
                  <div className="relative flex items-center justify-center w-9 h-9 shrink-0">
                    <div className="absolute w-9 h-9 rounded-full bg-sage/15 animate-ping opacity-60" />
                    <div className="relative w-3 h-3 rounded-full bg-sage" />
                  </div>
                ) : (
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-cream/16" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-sm text-cream">
                    {trackingLocation ? 'Sharing your location' : 'Location off'}
                  </p>
                  <p className="text-xs text-parchment-dim">
                    {trackingLocation ? 'Group can see where you are' : 'Tap to share GPS with participants'}
                  </p>
                </div>
              </div>
              <Button
                variant={trackingLocation ? 'destructive' : 'outline'}
                size="sm"
                onClick={trackingLocation ? stopLocationTracking : startLocationTracking}
                className="gap-1.5 shrink-0"
                disabled={!crawl}
              >
                {trackingLocation ? <WifiOff className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                {trackingLocation ? 'Stop' : 'Share'}
              </Button>
            </div>
            {gpsError && (
              <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{gpsError}</p>
            )}
          </CardContent>
        </Card>

        {/* Invite card */}
        {crawl && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm text-cream">Invite participants</p>
                  <p className="text-xs text-parchment-dim">Share a QR code to let people join</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowJoinQr(true)}
                  className="gap-1.5 shrink-0"
                >
                  <QrCode className="w-4 h-4" /> Show QR
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pub list */}
        <div className="space-y-2">
          <p className="font-semibold text-sm px-1 text-cream">All pubs</p>
          {pubs.map((pub, i) => {
            const isVisited = pub.status === 'visited'
            const isCurrent = pub.status === 'current'
            return (
              <Card
                key={pub.id}
                className={`overflow-hidden transition-all ${
                  isCurrent ? 'ring-2 ring-sage/40 shadow-sm' :
                  isVisited ? 'opacity-55' : ''
                }`}
              >
                <CardContent className="p-0">
                  <div className="flex">
                    <div className={`w-1 shrink-0 ${
                      isCurrent ? 'bg-sage' :
                      isVisited ? 'bg-cream/12' :
                      'bg-copper/20'
                    }`} />
                    <div className="flex-1 p-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isVisited ? 'bg-cream/8 text-parchment-dim' :
                          isCurrent ? 'bg-sage/15 text-sage-dim' :
                          'bg-copper/8 text-copper-bright'
                        }`}>
                          {isVisited ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${isVisited ? 'line-through text-parchment-dim' : 'text-cream'}`}>
                            {pub.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-parchment">
                            {pub.address && (
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />{pub.address}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 shrink-0">
                              <Clock className="w-3 h-3" />{pub.planned_dwell_minutes}m
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 ml-1">
                          {pub.status === 'upcoming' && (
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs gap-1 bg-sage hover:bg-sage-dim text-cream rounded-full"
                              onClick={() => markArrived(pub)}
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Arrived
                            </Button>
                          )}
                          {isCurrent && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs gap-1 text-copper-bright border-copper/25 hover:bg-copper/8 rounded-full"
                              onClick={() => markDeparted(pub)}
                            >
                              <ArrowRight className="w-3.5 h-3.5" /> Depart
                            </Button>
                          )}
                          {isVisited && (
                            <Badge variant="secondary" className="text-xs bg-cream/8 text-parchment-dim">Done</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {pubs.length === 0 && (
            <p className="text-center text-parchment py-6 text-sm">No pubs added yet</p>
          )}
        </div>
      </div>

      {showJoinQr && crawl && (
        <JoinQRModal
          url={`${baseUrl()}/join/${crawl.join_token}`}
          onClose={() => setShowJoinQr(false)}
        />
      )}
    </div>
  )
}
