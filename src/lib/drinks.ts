import type { DrinkTotals } from './types'

export const DRINK_TYPES: { key: keyof DrinkTotals; emoji: string; label: string; step: number; points: number }[] = [
  { key: 'beers', emoji: '🍺', label: 'Pints', step: 0.5, points: 2 },
  { key: 'wine', emoji: '🍷', label: 'Wine', step: 0.5, points: 1 },
  { key: 'cocktails', emoji: '🍸', label: 'Cocktails', step: 1, points: 2 },
  { key: 'shots', emoji: '🥃', label: 'Shots', step: 1, points: 1 },
  { key: 'soft_drinks', emoji: '🧃', label: 'Soft drinks', step: 0.5, points: 0 },
]

export const EMPTY_DRINK_TOTALS: DrinkTotals = { beers: 0, wine: 0, cocktails: 0, shots: 0, soft_drinks: 0 }

export function totalDrinks(d: DrinkTotals): number {
  return d.beers + d.wine + d.cocktails + d.shots + d.soft_drinks
}

export function hasAnyDrinks(d: DrinkTotals): boolean {
  return totalDrinks(d) > 0
}

// Leaderboard ranking score — weighted so alcoholic drinks count for more than
// soft drinks (which score 0), rather than ranking by raw drink count.
export function totalPoints(d: DrinkTotals): number {
  return DRINK_TYPES.reduce((sum, { key, points }) => sum + d[key] * points, 0)
}
