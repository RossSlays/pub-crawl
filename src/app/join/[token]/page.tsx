'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Beer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'form' | 'joining' | 'error'>('form')
  const [subtitle, setSubtitle] = useState<string | null>(null)
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  useEffect(() => {
    fetch(`/api/crawl?join_token=${token}`)
      .then(r => r.json())
      .then(d => setSubtitle(d.crawl?.subtitle ?? null))
      .catch(() => {})
  }, [token])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !emailValid) return
    setStatus('joining')
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'join', token, name: name.trim(), email: email.trim() }),
    })
    if (res.ok) {
      router.replace('/?view=participant')
    } else {
      setStatus('error')
    }
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-copper to-ember">
        <div className="text-center text-cream px-6">
          <div className="text-4xl mb-4">😬</div>
          <p className="text-xl font-bold mb-2">Invalid invite link</p>
          <p className="text-cream/70 text-sm">Check with the crawl organiser for the correct link.</p>
        </div>
      </div>
    )
  }

  if (status === 'joining') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-copper to-ember">
        <div className="text-center text-cream">
          <Beer className="w-12 h-12 text-cream mx-auto animate-bounce" />
          <p className="text-xl font-black mt-4">Joining the crawl…</p>
          <p className="text-cream/60 text-sm mt-1">Get ready to party 🍺</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-copper to-ember px-6">
      <div className="w-full max-w-sm">
        <div className="text-center text-cream mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cream/70 mb-4">🎉 {subtitle || "Jack's 30th Birthday"}</p>
          <Beer className="w-14 h-14 text-cream mx-auto mb-4" />
          <h1 className="font-display font-semibold text-3xl">You're invited!</h1>
          <p className="text-cream/70 mt-2">Enter your name and email so the group knows you're here.</p>
        </div>

        <form onSubmit={join} className="space-y-3">
          <Input
            autoFocus
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-cream/20 border-cream/30 text-cream placeholder:text-cream/50 text-center text-lg font-semibold h-14 rounded-2xl focus:bg-cream/30 focus:border-cream"
          />
          <Input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-cream/20 border-cream/30 text-cream placeholder:text-cream/50 text-center text-lg font-semibold h-14 rounded-2xl focus:bg-cream/30 focus:border-cream"
          />
          <p className="text-cream/50 text-xs text-center px-2">
            Just used so rejoining on a different phone or browser keeps your ratings and drinks together — never shown to anyone else.
          </p>
          <Button
            type="submit"
            disabled={!name.trim() || !emailValid}
            className="w-full h-14 rounded-2xl bg-surface-raised text-copper-bright hover:bg-copper/10 font-black text-lg disabled:opacity-40"
          >
            Join the crawl 🍺
          </Button>
        </form>
      </div>
    </div>
  )
}
