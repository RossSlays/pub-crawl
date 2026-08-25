'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Beer, Plus, Trash2, MapPin, Clock, Navigation, QrCode, CheckCircle, ArrowRight, Users, Copy, Check, ChevronDown, ChevronUp, WifiOff, Wifi, RefreshCw, Footprints, GripVertical, Search, Megaphone, Pencil, Sparkles, Heart } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DwellAdjuster from '@/components/DwellAdjuster'
import DonationModal from '@/components/DonationModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Crawl, Pub, Leader, PubStatus } from '@/lib/types'
import { supabase } from '@/lib/supabase'

// Captures enough of a pub's prior state to fully reverse a "mark arrived" or
// "mark departed" action, including the knock-on auto-departure of whichever
// pub was previously current (see markArrived below).
type LastAction = {
  type: 'arrived' | 'departed'
  pubId: string
  pubName: string
  prevStatus: PubStatus
  prevArrival: string | null
  prevDeparture: string | null
  autoDeparted?: { pubId: string; prevStatus: PubStatus; prevDeparture: string | null }
}


function QRModal({ url, title = 'QR Code', onClose }: { url: string; title?: string; onClose: () => void }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <img src={qrUrl} alt={title} className="w-64 h-64 border rounded-lg" />
          <p className="text-xs text-gray-500 text-center break-all">{url}</p>
          <Button onClick={() => navigator.clipboard.writeText(url)} variant="outline" size="sm">
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PubForm({ crawlId, onAdd, adminKey }: { crawlId: string; onAdd: () => void; adminKey: string }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [dwell, setDwell] = useState('45')
  const [saving, setSaving] = useState(false)

  // Autocomplete state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  // Debounced Nominatim search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setShowDropdown(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=gb`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const data = await res.json()
        setResults(data)
        setShowDropdown(data.length > 0)
      } catch {
        // Network error — silently ignore
      } finally {
        setSearching(false)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [query])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/pubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        crawl_id: crawlId,
        name,
        address: address || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        planned_dwell_minutes: parseInt(dwell),
      }),
    })
    setSaving(false)
    setName('')
    setAddress('')
    setLat('')
    setLng('')
    setDwell('45')
    setQuery('')
    setResults([])
    onAdd()
  }

  return (
    <form onSubmit={submit} className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
      <p className="font-semibold text-sm text-amber-900">Add pub</p>

      {/* Search */}
      <div className="relative">
        <Label className="text-xs">Search for a pub</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder="The Anchor, Richmond..."
            className="pl-8 pr-8"
          />
          {searching && <div className="absolute right-2.5 top-2.5 w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
        </div>
        {showDropdown && results.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
            {results.map((r: any, i: number) => (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-100 last:border-0"
                onMouseDown={() => {
                  setName(r.name || r.display_name.split(',')[0])
                  const parts = r.display_name.split(',')
                  setAddress(parts.slice(0, 3).join(',').trim())
                  setLat(parseFloat(r.lat).toFixed(6))
                  setLng(parseFloat(r.lon).toFixed(6))
                  setQuery(r.name || r.display_name.split(',')[0])
                  setShowDropdown(false)
                }}
              >
                <p className="text-xs font-semibold text-gray-800 truncate">{r.name || r.display_name.split(',')[0]}</p>
                <p className="text-[10px] text-gray-500 truncate">{r.display_name}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Label className="text-xs">Pub name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="The Anchor" required />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Address</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="1 River St, Richmond" />
        </div>
        <div>
          <Label className="text-xs">Latitude</Label>
          <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="51.4613" type="number" step="any" />
        </div>
        <div>
          <Label className="text-xs">Longitude</Label>
          <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="-0.3037" type="number" step="any" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Dwell time (minutes)</Label>
          <Input value={dwell} onChange={e => setDwell(e.target.value)} type="number" min="5" max="240" />
        </div>
      </div>
      <Button type="submit" disabled={saving} className="w-full bg-amber-500 hover:bg-amber-600">
        <Plus className="w-4 h-4 mr-1" />{saving ? 'Adding…' : 'Add pub'}
      </Button>
    </form>
  )
}

function EditPubModal({ pub, adminKey, onClose, onSaved }: {
  pub: Pub
  adminKey: string
  onClose: () => void
  onSaved: (updated: Pub, dwellChanged: boolean) => void | Promise<void>
}) {
  const [name, setName] = useState(pub.name)
  const [address, setAddress] = useState(pub.address ?? '')
  const [lat, setLat] = useState(pub.lat != null ? String(pub.lat) : '')
  const [lng, setLng] = useState(pub.lng != null ? String(pub.lng) : '')
  const [dwell, setDwell] = useState(String(pub.planned_dwell_minutes))
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const nextDwell = parseInt(dwell) || pub.planned_dwell_minutes
    const dwellChanged = nextDwell !== pub.planned_dwell_minutes
    const res = await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        id: pub.id,
        name: name.trim(),
        address: address.trim() || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        planned_dwell_minutes: nextDwell,
      }),
    })
    setSaving(false)
    if (res.ok) {
      const { pub: updated } = await res.json()
      await onSaved(updated, dwellChanged)
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit pub</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Pub name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Latitude</Label>
              <Input value={lat} onChange={e => setLat(e.target.value)} type="number" step="any" />
            </div>
            <div>
              <Label className="text-xs">Longitude</Label>
              <Input value={lng} onChange={e => setLng(e.target.value)} type="number" step="any" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Dwell time (minutes)</Label>
            <Input value={dwell} onChange={e => setDwell(e.target.value)} type="number" min="5" max="240" />
          </div>
          <Button onClick={save} disabled={saving || !name.trim()} className="w-full bg-amber-500 hover:bg-amber-600">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WalkingTimeInput({ pubId, initialValue, adminKey, onSaved }: {
  pubId: string
  initialValue: number | null
  adminKey: string
  onSaved: (val: number) => void
}) {
  const [val, setVal] = useState(initialValue != null ? String(initialValue) : '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Keep in sync if the pub reloads from server
  useEffect(() => {
    setVal(initialValue != null ? String(initialValue) : '')
  }, [initialValue])

  async function save() {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) return
    if (n === initialValue) return
    setStatus('saving')
    const res = await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: pubId, walking_minutes_to_next: n }),
    })
    if (res.ok) {
      setStatus('saved')
      onSaved(n)
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
      <Footprints className="w-3 h-3 shrink-0" />
      <span>Walk to next:</span>
      <input
        type="number"
        min="0"
        value={val}
        placeholder="—"
        onChange={e => { setVal(e.target.value); setStatus('idle') }}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); save() } }}
        className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
      <span>min</span>
      {status === 'saving' && <span className="text-gray-400">…</span>}
      {status === 'saved' && <span className="text-green-500">✓</span>}
      {status === 'error' && <span className="text-red-500" title="Save failed — check the column exists in Supabase">✗</span>}
    </div>
  )
}

function SortablePubCard({ id, children }: { id: string; children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('')
  const [ready, setReady] = useState(false)
  const [crawl, setCrawl] = useState<Crawl | null>(null)
  const [pubs, setPubs] = useState<Pub[]>([])
  const [showQR, setShowQR] = useState(false)
  const [trackingLocation, setTrackingLocation] = useState(false)
  const [crawlName, setCrawlName] = useState('')
  const [eventLabel, setEventLabel] = useState('')
  const [donationUrl, setDonationUrl] = useState('')
  const [previewDonation, setPreviewDonation] = useState(false)
  const [crawlDate, setCrawlDate] = useState(new Date().toISOString().split('T')[0])
  const [crawlStartTime, setCrawlStartTime] = useState('')
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [newLeaderName, setNewLeaderName] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedLeaderId, setExpandedLeaderId] = useState<string | null>(null)
  const [leaderQrUrl, setLeaderQrUrl] = useState<string | null>(null)
  const [networkHost, setNetworkHost] = useState<string | null>(null)
  const [showAddPub, setShowAddPub] = useState(false)
  const [editingPub, setEditingPub] = useState<Pub | null>(null)
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastStatus, setBroadcastStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watchRef = useRef<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = useCallback(async (key: string) => {
    const crawlRes = await fetch('/api/crawl').then(r => r.json())
    const pubsRes = crawlRes.crawl?.id
      ? await fetch(`/api/pubs?crawl_id=${crawlRes.crawl.id}`).then(r => r.json())
      : { pubs: [] }
    setCrawl(crawlRes.crawl)
    setCrawlName(crawlRes.crawl?.name ?? '')
    setEventLabel(crawlRes.crawl?.subtitle ?? '')
    setDonationUrl(crawlRes.crawl?.donation_url ?? '')
    setCrawlDate(crawlRes.crawl?.date ?? new Date().toISOString().split('T')[0])
    setCrawlStartTime(crawlRes.crawl?.start_time?.slice(0, 5) ?? '')
    setPubs((pubsRes.pubs ?? []).sort((a: Pub, b: Pub) => a.order_index - b.order_index))
    if (crawlRes.crawl) {
      fetch(`/api/leaders?crawl_id=${crawlRes.crawl.id}`, { headers: { 'x-admin-key': key } })
        .then(r => r.json())
        .then(d => setLeaders(d.leaders ?? []))
    }
  }, [])

  useEffect(() => {
    const urlKey = new URLSearchParams(window.location.search).get('key') ?? ''
    const storedKey = typeof window !== 'undefined' ? (localStorage.getItem('admin_key') ?? '') : ''
    const key = urlKey || storedKey

    if (urlKey) {
      localStorage.setItem('admin_key', urlKey)
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'admin', password: urlKey }),
      })
      history.replaceState(null, '', '/admin')
    }

    setAdminKey(key)
    setReady(true)
    if (key) load(key)
    fetch('/api/host').then(r => r.json()).then(d => { if (d.host) setNetworkHost(d.host) })
  }, [load])

  useEffect(() => {
    if (!crawl?.id) return
    const sub = supabase
      .channel('admin-pubs-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pubs', filter: `crawl_id=eq.${crawl.id}` }, () => {
        load(adminKey)
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [crawl?.id, adminKey, load])

  async function createCrawl() {
    const res = await fetch('/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ name: crawlName || 'Thames Pub Crawl', date: crawlDate }),
    })
    const { crawl: c } = await res.json()
    setCrawl(c)
    setPubs([])
  }

  async function updateCrawlStatus(status: string) {
    if (!crawl) return
    const res = await fetch('/api/crawl', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: crawl.id, status }),
    })
    const { crawl: c } = await res.json()
    setCrawl(c)
  }

  async function startCrawl() {
    if (!crawl) return
    const now = new Date()
    const actualStartTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const res = await fetch('/api/crawl', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: crawl.id, status: 'active', start_time: actualStartTime }),
    })
    const { crawl: c } = await res.json()
    setCrawl(c)
    setCrawlStartTime(actualStartTime)
    await fetch('/api/crawl/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id }),
    })
    await load(adminKey)
  }

  async function updatePubField(pubId: string, updates: Partial<Pub>) {
    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: pubId, ...updates }),
    })
    setPubs(prev => prev.map(p => p.id === pubId ? { ...p, ...updates } : p))
  }

  async function recalculateSchedule() {
    if (!crawl) return
    if (!crawl.start_time) {
      alert('Set a crawl start time before recalculating.')
      return
    }
    await fetch('/api/crawl/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id }),
    })
    await load(adminKey)
  }

  async function sendBroadcast(msg: string) {
    if (!crawl || !msg.trim()) return
    setBroadcastStatus('sending')
    const res = await fetch('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id, message: msg.trim() }),
    })
    setBroadcastStatus(res.ok ? 'sent' : 'error')
    if (res.ok) setBroadcastMsg('')
    setTimeout(() => setBroadcastStatus('idle'), 3000)
  }

  async function resetCrawl() {
    if (!crawl) return
    if (!window.confirm('Reset the crawl? This will clear all pub progress, locations, ratings, and drinks — but keep the pub list and leaders.')) return
    await fetch('/api/crawl/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id }),
    })
    await load(adminKey)
  }

  function armUndo(action: LastAction) {
    setLastAction(action)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setLastAction(null), 20000)
  }

  async function markArrived(pub: Pub) {
    // Mark previous current as visited
    const prevCurrent = pubs.find(p => p.status === 'current' && p.id !== pub.id)

    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: pub.id, status: 'current', actual_arrival_at: new Date().toISOString() }),
    })

    if (prevCurrent) {
      await fetch('/api/pubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ id: prevCurrent.id, status: 'visited', actual_departure_at: new Date().toISOString() }),
      })
    }

    armUndo({
      type: 'arrived',
      pubId: pub.id,
      pubName: pub.name,
      prevStatus: pub.status,
      prevArrival: pub.actual_arrival_at,
      prevDeparture: pub.actual_departure_at,
      autoDeparted: prevCurrent
        ? { pubId: prevCurrent.id, prevStatus: prevCurrent.status, prevDeparture: prevCurrent.actual_departure_at }
        : undefined,
    })

    await load(adminKey)
  }

  async function markDeparted(pub: Pub) {
    if (!window.confirm(`Mark departed from ${pub.name}? This finalizes their visit and reschedules the remaining stops.`)) return

    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ id: pub.id, status: 'visited', actual_departure_at: new Date().toISOString() }),
    })

    armUndo({
      type: 'departed',
      pubId: pub.id,
      pubName: pub.name,
      prevStatus: pub.status,
      prevArrival: pub.actual_arrival_at,
      prevDeparture: pub.actual_departure_at,
    })

    await load(adminKey)
  }

  async function undoLastAction() {
    if (!lastAction) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)

    await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({
        id: lastAction.pubId,
        status: lastAction.prevStatus,
        actual_arrival_at: lastAction.prevArrival,
        actual_departure_at: lastAction.prevDeparture,
      }),
    })

    if (lastAction.autoDeparted) {
      await fetch('/api/pubs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          id: lastAction.autoDeparted.pubId,
          status: lastAction.autoDeparted.prevStatus,
          actual_departure_at: lastAction.autoDeparted.prevDeparture,
        }),
      })
    }

    setLastAction(null)

    // The mistaken action may have cascaded schedule changes to other pubs —
    // a full recalculate resets everything cleanly from the corrected state.
    if (crawl?.start_time) {
      await fetch('/api/crawl/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ crawl_id: crawl.id }),
      })
    }

    await load(adminKey)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !crawl) return
    const oldIndex = pubs.findIndex(p => p.id === active.id)
    const newIndex = pubs.findIndex(p => p.id === over.id)
    const reordered = arrayMove(pubs, oldIndex, newIndex)
    setPubs(reordered)
    await fetch('/api/pubs/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id, ids: reordered.map(p => p.id) }),
    })
  }

  async function deletePub(id: string) {
    await fetch(`/api/pubs?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    })
    await load(adminKey)
  }

  function startLocationTracking() {
    if (!crawl) return
    setTrackingLocation(true)
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        fetch('/api/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
          body: JSON.stringify({ crawl_id: crawl.id, lat: pos.coords.latitude, lng: pos.coords.longitude }),
        })
      },
      null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  function stopLocationTracking() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current)
    setTrackingLocation(false)
  }

  async function addLeader(e: React.FormEvent) {
    e.preventDefault()
    if (!crawl || !newLeaderName.trim()) return
    const res = await fetch('/api/leaders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ crawl_id: crawl.id, name: newLeaderName.trim() }),
    })
    const { leader } = await res.json()
    setLeaders(prev => [...prev, leader])
    setNewLeaderName('')
  }

  async function deleteLeader(id: string) {
    await fetch(`/api/leaders?id=${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } })
    setLeaders(prev => prev.filter(l => l.id !== id))
  }

  function baseUrl() {
    if (networkHost) return `http://${networkHost}`
    return window.location.origin
  }

  function leaderUrl(leader: Leader) {
    return `${baseUrl()}/leader/${leader.token}`
  }

  async function copyLeaderUrl(leader: Leader) {
    const url = leaderUrl(leader)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(leader.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard blocked (non-HTTPS context) — show the URL for manual copy
      setExpandedLeaderId(prev => prev === leader.id ? null : leader.id)
    }
  }

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Beer className="w-8 h-8 text-amber-500 animate-bounce" />
    </div>
  )

  if (!adminKey) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 text-center">
      <div>
        <Beer className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <p className="font-semibold text-gray-700">Admin access required</p>
        <p className="text-sm text-gray-500 mt-1">Open the admin link you were given.</p>
      </div>
    </div>
  )

  const joinUrl = crawl ? `${baseUrl()}/join/${crawl.join_token}` : ''

  const statusColors: Record<string, string> = {
    active: 'bg-green-500 text-white',
    completed: 'bg-gray-400 text-white',
    pending: 'bg-amber-300 text-amber-900',
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-10">
      {/* Header */}
      <header className="bg-gradient-to-b from-amber-700 to-amber-600 text-white px-4 pt-5 pb-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Beer className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-lg leading-tight block">
                {crawl ? crawl.name : 'Admin Panel'}
              </span>
              {crawl && (
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[crawl.status] ?? 'bg-amber-300 text-amber-900'}`}>
                    {crawl.status.charAt(0).toUpperCase() + crawl.status.slice(1)}
                  </span>
                  <span className="text-amber-200 text-xs">
                    {new Date(crawl.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
              )}
            </div>
          </div>
          <a href="/">
            <Button size="sm" variant="ghost" className="text-amber-200 hover:bg-amber-700 text-xs mt-0.5">View app</Button>
          </a>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* Crawl setup */}
        {!crawl ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Create Crawl</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={crawlName} onChange={e => setCrawlName(e.target.value)} placeholder="Thames Pub Crawl" />
              </div>
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={crawlDate} onChange={e => setCrawlDate(e.target.value)} />
              </div>
              <Button onClick={createCrawl} className="w-full bg-amber-500 hover:bg-amber-600">
                Create crawl
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Crawl controls */}
            <Card>
              <CardContent className="pt-4 space-y-4">
                {/* Event label row */}
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gray-400 shrink-0" />
                  <Label className="text-xs text-gray-600 shrink-0">Event label</Label>
                  <Input
                    value={eventLabel}
                    onChange={e => setEventLabel(e.target.value)}
                    placeholder="Jack's 30th Birthday"
                    className="flex-1 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={async () => {
                      const res = await fetch('/api/crawl', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                        body: JSON.stringify({ id: crawl.id, subtitle: eventLabel || null }),
                      })
                      const { crawl: c } = await res.json()
                      setCrawl(c)
                    }}
                  >
                    Save
                  </Button>
                </div>

                {/* Donation link row */}
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-gray-400 shrink-0" />
                  <Label className="text-xs text-gray-600 shrink-0">Donation link</Label>
                  <Input
                    value={donationUrl}
                    onChange={e => setDonationUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={async () => {
                      const res = await fetch('/api/crawl', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                        body: JSON.stringify({ id: crawl.id, donation_url: donationUrl.trim() || null }),
                      })
                      const { crawl: c } = await res.json()
                      setCrawl(c)
                    }}
                  >
                    Save
                  </Button>
                </div>
                <div className="flex items-center justify-between -mt-2 ml-6">
                  <p className="text-[10px] text-gray-400">
                    Shown in the &quot;instead of buying Jack a pint&quot; modal, once someone&apos;s checked into their 3rd pub.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-auto py-0.5 px-2 text-violet-600 hover:text-violet-700 hover:bg-violet-50 shrink-0"
                    onClick={() => setPreviewDonation(true)}
                  >
                    Preview
                  </Button>
                </div>

                {/* Date row */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <Label className="text-xs text-gray-600 shrink-0">Date</Label>
                  <Input
                    type="date"
                    value={crawlDate}
                    onChange={e => setCrawlDate(e.target.value)}
                    className="w-36 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={async () => {
                      const res = await fetch('/api/crawl', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                        body: JSON.stringify({ id: crawl.id, date: crawlDate }),
                      })
                      const { crawl: c } = await res.json()
                      setCrawl(c)
                    }}
                  >
                    Save
                  </Button>
                </div>

                {/* Start time row */}
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                  <Label className="text-xs text-gray-600 shrink-0">Start time</Label>
                  <Input
                    type="time"
                    value={crawlStartTime}
                    onChange={e => setCrawlStartTime(e.target.value)}
                    className="w-32 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={async () => {
                      const res = await fetch('/api/crawl', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                        body: JSON.stringify({ id: crawl.id, start_time: crawlStartTime || null }),
                      })
                      const { crawl: c } = await res.json()
                      setCrawl(c)
                    }}
                  >
                    Save
                  </Button>
                </div>

                {/* Action buttons 2-column grid */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowQR(true)}
                    className="gap-1.5 justify-center"
                  >
                    <QrCode className="w-4 h-4" /> Participant QR
                  </Button>
                  <Button
                    size="sm"
                    variant={trackingLocation ? 'destructive' : 'outline'}
                    onClick={trackingLocation ? stopLocationTracking : startLocationTracking}
                    className="gap-1.5 justify-center"
                  >
                    {trackingLocation ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                    {trackingLocation ? 'Stop GPS' : 'Share GPS'}
                  </Button>
                  {crawl.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={startCrawl}
                      className="col-span-2 bg-green-500 hover:bg-green-600 text-white justify-center gap-1.5"
                    >
                      Start crawl
                    </Button>
                  )}
                  {crawl.status === 'active' && (
                    <Button
                      size="sm"
                      onClick={() => updateCrawlStatus('completed')}
                      className="col-span-2 bg-red-500 hover:bg-red-600 text-white justify-center gap-1.5"
                    >
                      End crawl
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={resetCrawl}
                    className="col-span-2 text-gray-500 border-gray-200 hover:bg-gray-50 justify-center gap-1.5"
                  >
                    Reset crawl
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Broadcast */}
            {crawl.status === 'active' && (() => {
              const currentPub = pubs.find(p => p.status === 'current')
              const nextPub = pubs.filter(p => p.status === 'upcoming')[0]
              const presets = [
                nextPub && `🚶 Time to move! Heading to ${nextPub.name}`,
                currentPub && `⏰ Last orders at ${currentPub.name}! Moving soon`,
                '📍 Everyone meet at the bar',
                '🚨 Group photo time!',
              ].filter(Boolean) as string[]
              return (
                <Card className="border-orange-200 bg-orange-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                      <Megaphone className="w-4 h-4" /> Broadcast to everyone
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {presets.map(p => (
                        <button
                          key={p}
                          onClick={() => sendBroadcast(p)}
                          disabled={broadcastStatus === 'sending'}
                          className="text-xs bg-white border border-orange-200 text-orange-700 font-medium px-3 py-1.5 rounded-full hover:bg-orange-100 transition-colors disabled:opacity-50 text-left"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={broadcastMsg}
                        onChange={e => setBroadcastMsg(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendBroadcast(broadcastMsg)}
                        placeholder="Custom message…"
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <Button
                        onClick={() => sendBroadcast(broadcastMsg)}
                        disabled={!broadcastMsg.trim() || broadcastStatus === 'sending'}
                        className="bg-orange-500 hover:bg-orange-600 text-white shrink-0"
                        size="sm"
                      >
                        {broadcastStatus === 'sending' ? '…' : broadcastStatus === 'sent' ? '✓ Sent!' : broadcastStatus === 'error' ? '✗' : 'Send'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Leaders */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" /> Leaders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {leaders.map(leader => (
                  <div key={leader.id} className="border-l-4 border-amber-400 bg-gray-50 rounded-r-lg overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{leader.name}</p>
                        <p className="text-xs text-gray-400 truncate font-mono">/leader/{leader.token}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-gray-500 hover:bg-gray-100 gap-1"
                          onClick={() => setLeaderQrUrl(leaderUrl(leader))}
                          title="Show QR code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">QR</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-gray-500 hover:bg-gray-100 gap-1"
                          onClick={() => copyLeaderUrl(leader)}
                          title="Copy leader link"
                        >
                          {copiedId === leader.id
                            ? <><Check className="w-3.5 h-3.5 text-green-500" /><span className="hidden sm:inline text-green-600">Copied</span></>
                            : <><Copy className="w-3.5 h-3.5" /><span className="hidden sm:inline">Copy</span></>
                          }
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-red-400 hover:bg-red-50 gap-1"
                          onClick={() => deleteLeader(leader.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Remove</span>
                        </Button>
                      </div>
                    </div>
                    {expandedLeaderId === leader.id && (
                      <div className="px-3 pb-2.5">
                        <p className="text-[10px] text-amber-700 font-medium mb-1">Clipboard blocked — copy this link manually:</p>
                        <input
                          readOnly
                          value={leaderUrl(leader)}
                          onFocus={e => e.target.select()}
                          className="w-full text-xs bg-white border border-amber-200 rounded px-2 py-1.5 font-mono text-gray-700 select-all"
                        />
                      </div>
                    )}
                  </div>
                ))}
                {leaders.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-1">Add people who can mark pubs and share their location</p>
                )}
                <form onSubmit={addLeader} className="flex gap-2 pt-1">
                  <Input
                    value={newLeaderName}
                    onChange={e => setNewLeaderName(e.target.value)}
                    placeholder="Leader name"
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" className="bg-amber-500 hover:bg-amber-600 shrink-0 px-3">
                    <Plus className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Pub list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="font-semibold text-sm text-gray-700">Pubs ({pubs.length})</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={recalculateSchedule}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1.5 h-7 px-2"
                >
                  <RefreshCw className="w-3 h-3" /> Recalculate schedule
                </Button>
              </div>

              {lastAction && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-amber-800">
                    Marked <span className="font-semibold">{lastAction.pubName}</span> as {lastAction.type}
                    {lastAction.autoDeparted ? ' (and auto-departed the previous pub)' : ''}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs text-amber-800 border-amber-300 bg-white hover:bg-amber-100 shrink-0"
                    onClick={undoLastAction}
                  >
                    Undo
                  </Button>
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pubs.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {pubs.map((pub, i) => {
                const isVisited = pub.status === 'visited'
                const isCurrent = pub.status === 'current'
                const isDraggable = pub.status === 'upcoming'
                return (
                  <SortablePubCard key={pub.id} id={pub.id}>
                    {(dragHandleProps) => (
                  <Card
                    className={`overflow-hidden transition-all ${
                      isCurrent ? 'ring-2 ring-green-400 shadow-md' :
                      isVisited ? 'opacity-60' : ''
                    }`}
                  >
                    <CardContent className="p-0">
                      {/* Coloured left stripe */}
                      <div className="flex">
                        <div className={`w-1 shrink-0 ${
                          isCurrent ? 'bg-green-400' :
                          isVisited ? 'bg-gray-200' :
                          'bg-blue-200'
                        }`} />
                        <div className="flex-1 p-3">
                          <div className="flex items-start gap-2">
                            {isDraggable ? (
                              <button
                                {...dragHandleProps}
                                className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing mt-1 shrink-0 -ml-1 p-0.5"
                                aria-label="Drag to reorder"
                                tabIndex={-1}
                              >
                                <GripVertical className="w-4 h-4" />
                              </button>
                            ) : (
                              <div className="w-4 shrink-0" />
                            )}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              isVisited ? 'bg-gray-100 text-gray-400' :
                              isCurrent ? 'bg-green-100 text-green-700' :
                              'bg-blue-50 text-blue-600'
                            }`}>{i + 1}</div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm ${isVisited ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {pub.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
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
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-gray-400 hover:bg-gray-50 shrink-0"
                              onClick={() => setEditingPub(pub)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-400 hover:bg-red-50 shrink-0"
                              onClick={() => deletePub(pub.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>

                          {/* Walk time to next pub */}
                          {i < pubs.length - 1 && (
                            <WalkingTimeInput
                              pubId={pub.id}
                              initialValue={pub.walking_minutes_to_next}
                              adminKey={adminKey}
                              onSaved={async val => {
                                setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, walking_minutes_to_next: val } : p))
                                if (crawl?.start_time) {
                                  await fetch('/api/crawl/recalculate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                                    body: JSON.stringify({ crawl_id: crawl.id }),
                                  })
                                  await load(adminKey)
                                }
                              }}
                            />
                          )}

                          {/* Status badge for visited */}
                          {isVisited && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                              <CheckCircle className="w-3.5 h-3.5 text-gray-300" />
                              <span>Visited</span>
                            </div>
                          )}

                          {/* Action buttons */}
                          {!isVisited && (
                            <div className="mt-3 flex gap-2">
                              {pub.status === 'upcoming' && (
                                <Button
                                  size="sm"
                                  className="flex-1 bg-green-500 hover:bg-green-600 text-white gap-1.5 rounded-full"
                                  onClick={() => markArrived(pub)}
                                >
                                  <CheckCircle className="w-4 h-4" /> Mark arrived
                                </Button>
                              )}
                              {isCurrent && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50 gap-1.5 rounded-full"
                                  onClick={() => markDeparted(pub)}
                                >
                                  <ArrowRight className="w-4 h-4" /> Mark departed
                                </Button>
                              )}
                            </div>
                          )}

                          {isCurrent && i < pubs.length - 1 && (
                            <DwellAdjuster
                              pub={pub}
                              authHeader={{ key: 'x-admin-key', value: adminKey }}
                              onUpdate={updated => setPubs(prev => prev.map(p => p.id === updated.id ? updated : p))}
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                    )}
                  </SortablePubCard>
                )
              })}
                </SortableContext>
              </DndContext>

              {/* Add pub toggle */}
              <div className="pt-1">
                {!showAddPub ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-dashed border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowAddPub(true)}
                  >
                    <Plus className="w-4 h-4" /> Add pub
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-400 gap-1 px-1"
                      onClick={() => setShowAddPub(false)}
                    >
                      <ChevronUp className="w-3.5 h-3.5" /> Hide form
                    </Button>
                    <PubForm crawlId={crawl.id} onAdd={() => { load(adminKey); setShowAddPub(false) }} adminKey={adminKey} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editingPub && (
        <EditPubModal
          pub={editingPub}
          adminKey={adminKey}
          onClose={() => setEditingPub(null)}
          onSaved={async (updated, dwellChanged) => {
            setPubs(prev => prev.map(p => p.id === updated.id ? updated : p))
            if (dwellChanged && crawl?.start_time) {
              await fetch('/api/crawl/recalculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
                body: JSON.stringify({ crawl_id: crawl.id }),
              })
              await load(adminKey)
            }
          }}
        />
      )}
      {showQR && joinUrl && <QRModal url={joinUrl} title="Participant QR Code" onClose={() => setShowQR(false)} />}
      {crawl && (
        <DonationModal
          crawlId={crawl.id}
          donationUrl={donationUrl.trim() || null}
          active={false}
          forceOpen={previewDonation}
          onForceClose={() => setPreviewDonation(false)}
        />
      )}
      {leaderQrUrl && (
        <QRModal
          url={leaderQrUrl}
          title={`Leader QR — ${leaders.find(l => leaderUrl(l) === leaderQrUrl)?.name ?? 'Leader'}`}
          onClose={() => setLeaderQrUrl(null)}
        />
      )}
    </div>
  )
}
