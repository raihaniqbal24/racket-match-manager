export type Format = 'singles' | 'doubles'

export type SportId =
  | 'tennis'
  | 'badminton'
  | 'padel'
  | 'pickleball'
  | 'squash'
  | 'table-tennis'

export type CourtStatus = 'idle' | 'pending' | 'playing'

export interface Player {
  id: string
  name: string
  arrived: boolean
  /** false = sitting out */
  available: boolean
  matchCount: number
  /** Matches confirmed and in play but not yet completed. */
  matchCountPending: number
  waitStreak: number
  currentlyPlaying: boolean
  /** Held by a match that is still under review. */
  reserved: boolean
  partnerId: string | null
  arrivalOrder?: number
  arrivalTime?: number
}

export interface Court {
  /** 1-based court number. */
  court: number
  status: CourtStatus
  /** Doubles: slots 0-1 are side A, 2-3 side B. Singles: slot 0 vs slot 1. */
  players: string[]
  matchId?: string | null
  startedAt?: string | null
  roundNumber?: number | null
}

export interface Score {
  a: number
  b: number
}

export interface MatchRecord {
  court: number
  courtName: string
  roundNumber: number
  players: string[]
  startedAt: string | null
  completedAt: string
  score: Score | null
}

export interface SessionState {
  version: number
  sport: SportId
  courts: number
  courtNames: string[]
  format: Format
  players: Player[]
  history: MatchRecord[]
  currentCourts: Court[]
  nextRoundNumber: number
  lastSaved: string | null
}

export interface ProposedMatch {
  court: number
  players: string[]
}

export interface RelationshipMaps {
  teammate: Map<string, number>
  opponent: Map<string, number>
  lastPlayed: Set<string>
}

export interface ActionResult {
  ok: boolean
  message?: string
}
