import type { Format, SportId } from './types'

export interface Sport {
  id: SportId
  label: string
  icon: string
  /** What a playing area is called: "Court" or "Table". */
  venue: string
  defaultFormat: Format
  /** What a score counts, used as the score-entry hint. */
  scoreUnit: string
}

export const SPORTS: Sport[] = [
  { id: 'tennis', label: 'Tennis', icon: '🎾', venue: 'Court', defaultFormat: 'doubles', scoreUnit: 'games' },
  { id: 'badminton', label: 'Badminton', icon: '🏸', venue: 'Court', defaultFormat: 'doubles', scoreUnit: 'points' },
  { id: 'padel', label: 'Padel', icon: '🎾', venue: 'Court', defaultFormat: 'doubles', scoreUnit: 'games' },
  { id: 'pickleball', label: 'Pickleball', icon: '🥒', venue: 'Court', defaultFormat: 'doubles', scoreUnit: 'points' },
  { id: 'squash', label: 'Squash', icon: '⚫', venue: 'Court', defaultFormat: 'singles', scoreUnit: 'games' },
  { id: 'table-tennis', label: 'Table tennis', icon: '🏓', venue: 'Table', defaultFormat: 'singles', scoreUnit: 'games' },
]

export const DEFAULT_SPORT: SportId = 'tennis'

export function getSport(id: SportId): Sport {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0]!
}

export function isSportId(value: unknown): value is SportId {
  return SPORTS.some((s) => s.id === value)
}
