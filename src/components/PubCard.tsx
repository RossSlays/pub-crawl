'use client'

import { useState, useRef, useEffect } from 'react'
import { Star, Clock, MapPin, ChevronDown, ChevronUp, Check, Navigation, Lock, Flag } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatETA, minutesUntil } from '@/lib/eta'
import { DRINK_TYPES, EMPTY_DRINK_TOTALS, hasAnyDrinks } from '@/lib/drinks'
import type { Pub, Rating, DrinkTotals } from '@/lib/types'

const COMMENTS_PAGE_SIZE = 5

interface Props {
  pub: Pub
  index: number
  ratings: Rating[]
  isParticipant: boolean
  myRating?: Rating
  onRate: (pubId: string, score: number, comment: string) => Promise<void>
  scheduledTime?: Date | null
  crawlId?: string
  myDrinks?: DrinkTotals
  isEnRoute?: boolean
  isLocked?: boolean
  crawlStarted?: boolean
}

// Renders 5 stars supporting half-star values. Read-only unless onRate is passed.
function Stars({ value, size = 'w-8 h-8', gap = 'gap-1.5', onRate }: {
  value: number
  size?: string
  gap?: string
  onRate?: (score: number) => void
}) {
  return (
    <div className={cn('flex', gap)}>
      {[1, 2, 3, 4, 5].map(s => {
        const fillPct = value >= s ? 100 : value >= s - 0.5 ? 50 : 0
        return (
          <div key={s} className={cn('relative', size)}>
            <Star className={cn(size, 'text-gray-200')} />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${fillPct}%` }}>
              <Star className={cn(size, 'fill-amber-400 text-amber-400')} />
            </div>
            {onRate && (
              <>
                <button
                  type="button"
                  aria-label={`Rate ${s - 0.5} stars`}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                  onClick={() => onRate(s - 0.5)}
                />
                <button
                  type="button"
                  aria-label={`Rate ${s} stars`}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                  onClick={() => onRate(s)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function PubCard({ pub, index, ratings, isParticipant, myRating, onRate, scheduledTime, crawlId, myDrinks, isEnRoute, isLocked, crawlStarted = true }: Props) {
  const [expanded, setExpanded] = useState(pub.status === 'current')
  const [score, setScore] = useState(myRating?.score ?? 0)
  const [comment, setComment] = useState(myRating?.comment ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [drinks, setDrinks] = useState<DrinkTotals>(myDrinks ?? EMPTY_DRINK_TOTALS)
  const [drinkSaveError, setDrinkSaveError] = useState(false)
  const [visibleCommentCount, setVisibleCommentCount] = useState(COMMENTS_PAGE_SIZE)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasEditedDrinksRef = useRef(false)
  const hasEditedRatingRef = useRef(false)

  // `myDrinks`/`myRating` often arrive after this component's first render
  // (they're fetched separately from the pub list), so the useState
  // initializers above miss them. Keep syncing from the prop — but only until
  // the person actually starts editing, so a background refresh never clobbers
  // an in-progress, not-yet-saved change.
  useEffect(() => {
    if (hasEditedDrinksRef.current) return
    if (myDrinks) setDrinks(myDrinks)
  }, [myDrinks])

  useEffect(() => {
    if (hasEditedRatingRef.current) return
    if (myRating) {
      setScore(myRating.score)
      setComment(myRating.comment ?? '')
    }
  }, [myRating])

  function saveDrink(updated: DrinkTotals) {
    if (!crawlId) return
    // Debounce so a burst of rapid taps (e.g. two taps to log "1 pint" via
    // half-pint steps) collapses into a single request with the final total,
    // instead of multiple requests that could race each other over the network.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      fetch('/api/drinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pub_id: pub.id, crawl_id: crawlId, ...updated }),
      })
        .then(res => setDrinkSaveError(!res.ok))
        .catch(() => setDrinkSaveError(true))
    }, 400)
  }

  function changeDrink(key: keyof DrinkTotals, delta: number) {
    hasEditedDrinksRef.current = true
    setDrinks(prev => {
      const updated = { ...prev, [key]: Math.max(0, prev[key] + delta) }
      saveDrink(updated)
      return updated
    })
  }

  async function submitRating() {
    setSubmitting(true)
    await onRate(pub.id, score, comment)
    setSubmitting(false)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  const avgRating = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length
    : null

  const commentedRatings = ratings
    .filter(r => r.comment)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const visibleReviews = commentedRatings.slice(0, visibleCommentCount)
  const remainingReviewCount = commentedRatings.length - visibleReviews.length

  const eta = scheduledTime ?? (pub.planned_arrival_at ? new Date(pub.planned_arrival_at) : null)
  const minsAway = eta ? minutesUntil(eta) : null

  const hasMyDrinks = hasAnyDrinks(drinks)

  const numberCircleClass = {
    current: 'bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-sm shadow-orange-200',
    visited: 'bg-gray-200 text-gray-500',
    upcoming: 'bg-white border-2 border-gray-300 text-gray-500',
  }[pub.status]

  return (
    <Card id={`pub-card-${pub.id}`} className={cn(
      'transition-all',
      pub.status === 'current' && 'ring-2 ring-orange-400 shadow-md shadow-orange-100',
      pub.status === 'visited' && 'opacity-75',
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0', numberCircleClass)}>
              {pub.status === 'visited' ? <Check className="w-4 h-4" /> : pub.is_meeting_point ? <Flag className="w-3.5 h-3.5" /> : index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={cn('font-semibold truncate', pub.status === 'current' && 'text-orange-900')}>{pub.name}</p>
                {pub.is_meeting_point && (
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full shrink-0">
                    Meeting point
                  </span>
                )}
              </div>
              {pub.address && (
                <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />{pub.address}
                </p>
              )}
              {pub.status === 'upcoming' && (
                <p className="text-xs text-orange-600 font-medium mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />{pub.planned_dwell_minutes} min {pub.is_meeting_point ? 'here' : 'drink time'}
                </p>
              )}
              {/* My summary pill — visible on collapsed visited cards */}
              {pub.status === 'visited' && isParticipant && (score > 0 || hasMyDrinks) && !expanded && (
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {score > 0 && <Stars value={score} size="w-3 h-3" gap="gap-0.5" />}
                  {hasMyDrinks && (
                    <span className="text-xs text-gray-400">
                      {DRINK_TYPES.filter(({ key }) => drinks[key] > 0).map(({ key, emoji }) => `${emoji}${drinks[key]}`).join(' ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pub.status === 'current' && (
              <Badge className="bg-gradient-to-r from-orange-500 to-rose-500 text-white border-0 text-xs">
                Here now
              </Badge>
            )}
            {pub.status === 'visited' && avgRating && (
              <span className="flex items-center gap-1 text-sm font-medium text-amber-600">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {avgRating.toFixed(1)}
              </span>
            )}
            {pub.status === 'visited' && isLocked && (
              <Lock className="w-3.5 h-3.5 text-gray-300" />
            )}
            {pub.status === 'upcoming' && isEnRoute && (
              <Badge className="bg-blue-500 text-white border-0 text-xs animate-pulse">
                En route
              </Badge>
            )}
            {pub.status === 'upcoming' && !isEnRoute && eta && crawlStarted && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {minsAway != null && minsAway > 0 ? `~${minsAway}m` : formatETA(eta)}
              </span>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {eta && pub.status === 'upcoming' && (
              <div className="flex justify-end text-sm text-gray-500">
                <span>ETA {formatETA(eta)}</span>
              </div>
            )}

            {(pub.status === 'current' || pub.status === 'upcoming') && pub.lat && pub.lng && (
              <a
                href={`https://maps.google.com/maps?daddr=${pub.lat},${pub.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Navigation className="w-3 h-3" /> Get directions
              </a>
            )}

            {!pub.is_meeting_point && (pub.status === 'current' ? (
              <p className="text-xs text-gray-400 italic flex items-center gap-1">
                <Clock className="w-3 h-3 shrink-0" /> Awaiting reviews — revealed once the group moves on
              </p>
            ) : ratings.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Stars value={avgRating ?? 0} size="w-4 h-4" gap="gap-0.5" />
                  <span className="text-xs text-gray-500">{ratings.length} rating{ratings.length !== 1 ? 's' : ''}</span>
                </div>
                {visibleReviews.map(r => (
                  <p key={r.id} className="text-xs text-gray-600 italic bg-gray-50 rounded-lg px-3 py-1.5 whitespace-pre-wrap">"{r.comment}"</p>
                ))}
                {remainingReviewCount > 0 && (
                  <button
                    onClick={() => setVisibleCommentCount(c => c + COMMENTS_PAGE_SIZE)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Show {Math.min(remainingReviewCount, COMMENTS_PAGE_SIZE)} more review{Math.min(remainingReviewCount, COMMENTS_PAGE_SIZE) !== 1 ? 's' : ''} ({remainingReviewCount} left)
                  </button>
                )}
              </div>
            ))}

            {!pub.is_meeting_point && isParticipant && (pub.status === 'current' || pub.status === 'visited') && crawlId && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Your drinks here</p>
                  {isLocked && <span className="text-[10px] text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>}
                </div>
                {drinkSaveError && (
                  <p className="text-xs text-red-500">⚠ Couldn't save that — check your connection and try tapping again.</p>
                )}
                {isLocked ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 py-1">
                    {DRINK_TYPES.map(({ key, emoji }) => (
                      <span key={key}>{emoji} {drinks[key]}</span>
                    ))}
                  </div>
                ) : (
                  DRINK_TYPES.map(({ key, emoji, label, step }) => {
                    const val = drinks[key]
                    const whole = Math.floor(val)
                    const half = val % 1 !== 0
                    const display = half ? (whole === 0 ? '½' : `${whole}½`) : String(whole)
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{emoji} {label}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => changeDrink(key, -step)}
                            disabled={val === 0}
                            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-gray-700 font-bold text-lg flex items-center justify-center"
                          >−</button>
                          <span className="tabular-nums w-6 text-center font-bold text-gray-900">{display}</span>
                          <button
                            onClick={() => changeDrink(key, step)}
                            className="w-8 h-8 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold text-lg flex items-center justify-center"
                          >+</button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {!pub.is_meeting_point && isParticipant && (pub.status === 'current' || pub.status === 'visited') && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {score > 0 ? 'Your rating' : 'Rate this pub'}
                  </p>
                  {isLocked && <span className="text-[10px] text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>}
                </div>
                <Stars value={score} onRate={isLocked ? undefined : s => { hasEditedRatingRef.current = true; setScore(s) }} />
                {!isLocked && (
                  <>
                    <Textarea
                      placeholder="Leave a comment (optional)"
                      value={comment}
                      onChange={e => { hasEditedRatingRef.current = true; setComment(e.target.value) }}
                      className="text-sm h-16 resize-none"
                    />
                    <Button
                      size="sm"
                      onClick={submitRating}
                      disabled={score === 0 || submitting}
                      className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white border-0"
                    >
                      {submitting ? 'Saving…' : justSaved ? '✓ Saved!' : score > 0 && myRating ? 'Update rating' : 'Submit rating'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
