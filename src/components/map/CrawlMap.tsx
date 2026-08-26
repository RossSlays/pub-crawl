'use client'

import { useEffect, useRef } from 'react'
import type { Pub, LiveLocation, LeaderLocation } from '@/lib/types'

const LEADER_COLORS = ['#8b5cf6', '#10b981', '#3b82f6', '#f59e0b', '#ec4899']

interface Props {
  pubs: Pub[]
  location: LiveLocation | null
  leaderLocations?: LeaderLocation[]
  scheduledTimes?: Map<string, Date>
}

export default function CrawlMap({ pubs, location, leaderLocations = [], scheduledTimes }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const liveMarkerRef = useRef<any>(null)
  const leaderMarkersRef = useRef<Map<string, any>>(new Map())
  const routeRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return
      if ((mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id
      }
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const pubsWithCoords = pubs.filter(p => p.lat && p.lng)
      const center: [number, number] = pubsWithCoords.length > 0
        ? [pubsWithCoords[0].lat!, pubsWithCoords[0].lng!]
        : [51.4613, -0.3037]

      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, 13)
      mapInstanceRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      if (pubsWithCoords.length > 1) {
        const coords = pubsWithCoords.map(p => [p.lat!, p.lng!] as [number, number])
        routeRef.current = L.polyline(coords, { color: '#f97316', weight: 3, opacity: 0.7, dashArray: '6 4' }).addTo(map)
      }

      pubsWithCoords.forEach((pub, i) => {
        const color = pub.is_meeting_point ? '#7c3aed' : pub.status === 'visited' ? '#9ca3af' : pub.status === 'current' ? '#f97316' : '#1d4ed8'
        const label = pub.is_meeting_point ? '📍' : String(i + 1)
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${label}</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })
        const scheduled = scheduledTimes?.get(pub.id)
        const timeHtml = scheduled
          ? `<br><span style="color:#9ca3af;font-size:11px">🕐 ${scheduled.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>`
          : ''
        const meetingHtml = pub.is_meeting_point
          ? `<br><span style="color:#7c3aed;font-size:11px;font-weight:600">MEETING POINT</span>`
          : ''
        const marker = L.marker([pub.lat!, pub.lng!], { icon })
          .addTo(map)
          .bindPopup(`<strong>${pub.name}</strong>${meetingHtml}${pub.address ? `<br><span style="color:#6b7280;font-size:12px">${pub.address}</span>` : ''}${timeHtml}`)
        markersRef.current.push(marker)
      })

      if (location) {
        liveMarkerRef.current = L.marker([location.lat, location.lng], { icon: buildLiveIcon(L) })
          .addTo(map)
          .bindPopup('Group location')
      }

      leaderLocations.forEach((ll, i) => {
        const color = LEADER_COLORS[i % LEADER_COLORS.length]
        const marker = L.marker([ll.lat, ll.lng], { icon: buildLeaderIcon(L, color) })
          .addTo(map)
          .bindPopup(buildLeaderPopup(ll.leader_name, ll.updated_at))
        leaderMarkersRef.current.set(ll.leader_id, marker)
      })

      if (pubsWithCoords.length > 0) {
        const bounds = L.latLngBounds(pubsWithCoords.map(p => [p.lat!, p.lng!]))
        if (location) bounds.extend([location.lat, location.lng])
        leaderLocations.forEach(ll => bounds.extend([ll.lat, ll.lng]))
        map.fitBounds(bounds, { padding: [30, 30] })
      }
    })

    return () => {
      cancelled = true
      mapInstanceRef.current?.remove()
      mapInstanceRef.current = null
      if (mapRef.current) {
        delete (mapRef.current as any)._leaflet_id
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapInstanceRef.current || !location) return
    import('leaflet').then(L => {
      if (liveMarkerRef.current) {
        liveMarkerRef.current.setLatLng([location.lat, location.lng])
      } else {
        liveMarkerRef.current = L.marker([location.lat, location.lng], { icon: buildLiveIcon(L) })
          .addTo(mapInstanceRef.current)
          .bindPopup('Group location')
      }
    })
  }, [location])

  useEffect(() => {
    if (!mapInstanceRef.current || leaderLocations.length === 0) return
    import('leaflet').then(L => {
      leaderLocations.forEach((ll, i) => {
        const color = LEADER_COLORS[i % LEADER_COLORS.length]
        const existing = leaderMarkersRef.current.get(ll.leader_id)
        if (existing) {
          existing.setLatLng([ll.lat, ll.lng])
          existing.setPopupContent(buildLeaderPopup(ll.leader_name, ll.updated_at))
        } else {
          const marker = L.marker([ll.lat, ll.lng], { icon: buildLeaderIcon(L, color) })
            .addTo(mapInstanceRef.current)
            .bindPopup(buildLeaderPopup(ll.leader_name, ll.updated_at))
          leaderMarkersRef.current.set(ll.leader_id, marker)
        }
      })
    })
  }, [leaderLocations])

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div className="w-full h-full">
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </>
  )
}

function buildLiveIcon(L: any) {
  return L.divIcon({
    html: `<div style="background:#ef4444;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px rgba(239,68,68,0.4)"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function buildLeaderIcon(L: any, color: string) {
  return L.divIcon({
    html: `<div style="background:${color};border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 3px ${color}66"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} mins ago`
  const hrs = Math.floor(mins / 60)
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`
}

function buildLeaderPopup(name: string, updatedAt: string): string {
  return `<strong>${name}</strong><br><span style="color:#9ca3af;font-size:11px">📍 Updated ${timeAgo(updatedAt)}</span>`
}
