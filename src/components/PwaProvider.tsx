'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function PwaProvider() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [dismissed, setDismissed] = useState(true) // start hidden until we know

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Install prompt
    if (localStorage.getItem('pwa-dismissed')) return
    setDismissed(false)

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [])

  async function install() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  function dismiss() {
    setDismissed(true)
    localStorage.setItem('pwa-dismissed', '1')
  }

  if (dismissed || !installPrompt) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 flex items-center gap-3">
      <div className="text-3xl shrink-0">🍺</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900">Add to Home Screen</p>
        <p className="text-xs text-gray-500">Install for quick access all night</p>
      </div>
      <button onClick={install} className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-full">
        Install
      </button>
      <button onClick={dismiss} className="shrink-0 text-gray-400 hover:text-gray-600 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
