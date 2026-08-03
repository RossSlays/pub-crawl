'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Beer } from 'lucide-react'

export default function LeaderJoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'joining' | 'error'>('joining')

  useEffect(() => {
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'leader', token }),
    }).then(res => {
      if (res.ok) {
        router.replace('/leader')
      } else {
        setStatus('error')
      }
    })
  }, [token, router])

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center">
          <p className="text-2xl mb-2">Invalid leader link</p>
          <p className="text-gray-500">Check with the crawl organiser for the correct link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center">
        <Beer className="w-12 h-12 text-amber-600 mx-auto mb-4 animate-bounce" />
        <p className="text-xl font-semibold">Setting up leader access…</p>
      </div>
    </div>
  )
}
