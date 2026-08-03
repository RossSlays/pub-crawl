'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import type { Pub } from '@/lib/types'

interface Props {
  pub: Pub
  authHeader: { key: string; value: string }
  onUpdate?: (updated: Pub) => void
}

const PRESETS = [
  { label: '−15m', delta: -15 },
  { label: '−10m', delta: -10 },
  { label: '−5m',  delta: -5  },
  { label: '+5m',  delta: 5   },
  { label: '+10m', delta: 10  },
]

export default function DwellAdjuster({ pub, authHeader, onUpdate }: Props) {
  const [dwell, setDwell] = useState(pub.planned_dwell_minutes)
  const [saving, setSaving] = useState(false)

  async function adjust(delta: number) {
    const next = Math.max(5, dwell + delta)
    if (next === dwell) return
    setSaving(true)
    setDwell(next)
    const res = await fetch('/api/pubs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', [authHeader.key]: authHeader.value },
      body: JSON.stringify({ id: pub.id, planned_dwell_minutes: next }),
    })
    if (res.ok) {
      const { pub: updated } = await res.json()
      onUpdate?.(updated)
    }
    setSaving(false)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Dwell time
        </span>
        <span className={`text-sm font-bold tabular-nums ${saving ? 'text-amber-500' : 'text-gray-800'}`}>
          {dwell}m
        </span>
      </div>
      <div className="flex gap-1.5">
        {PRESETS.map(({ label, delta }) => (
          <button
            key={label}
            onClick={() => adjust(delta)}
            disabled={saving || (delta < 0 && dwell + delta < 5)}
            className="flex-1 text-xs font-semibold py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
